package de.lambda9.ready2race.backend.app.stream.boundary

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.eventInfo.boundary.AthleteBoardLogic
import de.lambda9.ready2race.backend.app.eventInfo.boundary.EventInfoService
import de.lambda9.ready2race.backend.app.eventInfo.control.toAthleteBoardMatch
import de.lambda9.ready2race.backend.app.eventInfo.control.toAthleteBoardResult
import de.lambda9.ready2race.backend.app.eventInfo.entity.AthleteBoardMatch
import de.lambda9.ready2race.backend.app.eventInfo.entity.RunningMatchInfo
import de.lambda9.ready2race.backend.app.matchStatus.entity.MatchState
import de.lambda9.ready2race.backend.app.stream.control.StreamSceneRepo
import de.lambda9.ready2race.backend.app.stream.control.StreamOverrideRepo
import de.lambda9.ready2race.backend.app.stream.control.toDto
import de.lambda9.ready2race.backend.app.stream.entity.StreamBackground
import de.lambda9.ready2race.backend.app.stream.entity.StreamError
import de.lambda9.ready2race.backend.app.stream.entity.StreamFinishEntry
import de.lambda9.ready2race.backend.app.stream.entity.StreamGraphicType
import de.lambda9.ready2race.backend.app.stream.entity.StreamOverrideState
import de.lambda9.ready2race.backend.app.stream.entity.StreamSceneGraphicDto
import de.lambda9.ready2race.backend.app.stream.entity.StreamSceneViewDto
import de.lambda9.ready2race.backend.app.timing.boundary.TimingSequenceService
import de.lambda9.ready2race.backend.database.generated.tables.records.StreamSceneRecord
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.orDie
import de.lambda9.tailwind.core.extensions.kio.traverse
import java.time.LocalDateTime
import java.util.UUID

/**
 * Datenbeschaffung der Livestream-Szenen (Task 8): baut aus den ECHTEN Renn-Daten den
 * Schnappschuss [StreamResolverInput], schickt ihn durch den reinen [resolveScene] und setzt aus
 * dessen Ergebnis den [StreamSceneViewDto] zusammen — dieselbe Nutzlast für den GET-Einstieg
 * (`stream.kt`) und für den Push-Kanal ([StreamSceneBroadcaster]).
 *
 * Die Daten kommen bewusst aus DENSELBEN Quellen wie die Board-Anzeigen
 * ([EventInfoService.getRunningMatches], [EventInfoService.getUpcomingMatchesForBoard],
 * [EventInfoService.getLatestMatchResults]) und laufen durch dieselben Konvertierungen
 * (`toAthleteBoardMatch`/`toAthleteBoardResult`) — keine zweite Datenaufbereitung neben der
 * bestehenden, wie in der Spec festgelegt. Eine Regel, ein Ort: ändert sich dort etwas (Freilos,
 * Vereinskette, Klärung), trägt die Szene es ohne eigenes Zutun mit.
 *
 * Nach dem needs-Muster von `BoardLogic.dataNeeds` wird nur geholt, was die Szene wirklich
 * braucht: das Tagesprogramm nur mit SCHEDULE-Grafik, die Inhalte der Regie-Auswahl nur, wenn
 * eine FORCED_ON-Zeile überhaupt einen Lauf benennt.
 */
object StreamSceneLogic {

    /**
     * Wie viele aktivierte Läufe (In Vorbereitung + laufend) geholt werden. Der Normalfall ist
     * „einer fährt, einer steht am Steg"; an einem vollen Regattatag können mehrere Läufe
     * gleichzeitig auf dem Wasser sein, deshalb etwas Luft. Die Szene zeigt daraus genau zwei:
     * den zuletzt gestarteten fahrenden und den zuletzt an den Start gerufenen (siehe
     * [pickRunning]/[pickPreparing]).
     */
    private const val RUNNING_LIMIT = 5

    /**
     * Für den RESULT-Auto-Inhalt reicht das jüngste Ergebnis - die Grafik zeigt genau eins.
     * Dieselbe Quelle wie die „Letztes Ergebnis"-Kachel der Boards, inklusive `confirmedOnly`
     * (siehe [buildInput]).
     */
    private const val LATEST_RESULT_LIMIT = 1

    /** Zeilen des Tagesprogramms ohne eigene Einstellung — Vorgabe aus `settings.listLength`. */
    private const val DEFAULT_SCHEDULE_LENGTH = 8

    /**
     * Suchfenster für einen von der Regie BENANNTEN anstehenden Lauf. Die Auswahl im Panel ist
     * nicht auf „der nächste" beschränkt, deshalb reicht die eine Zeile nicht, die eine Szene
     * ohne Tagesprogramm sonst bräuchte. Ein hier nicht gefundener Lauf ist kein Fehler: er ist
     * dann entweder aktiviert (steht schon im Running-Block) oder beendet (kommt über sein
     * Ergebnis).
     */
    private const val OVERRIDE_LOOKUP_LIMIT = 10

    /**
     * Sprecherinnen-Details (Crew einzeln, Jahrgänge, meldender Verein) an allen Lauf-Blöcken -
     * EIN Schalter für alle, wie `BoardService.getBoardView` ihn aus `needs.crewDetails` zieht
     * und auf `running`, `upcoming` und `results` gleichermaßen anwendet.
     *
     * Für die Szene steht er fest auf `true`: Die Bootszeilen zeigen die Besatzung (dieselbe
     * Entscheidung, die die alte Stream-Kachel über `streamCrew` traf), und der Inhalt einer
     * Grafik darf nicht davon abhängen, ob die Szene NEBENBEI ein Tagesprogramm konfiguriert hat
     * - ein von der Regie erzwungenes NEXT_UP kommt aus demselben Block wie das Tagesprogramm.
     * Zusätzliche Abfragen kostet der Schalter keine, nur Nutzlast.
     */
    private const val CREW_DETAILS = true

    /**
     * Der aufgelöste Stand samt dem Zeitpunkt, an dem er von selbst veraltet.
     *
     * [nextEvaluationAt] gehört NICHT in den [StreamSceneViewDto] (die Bühne braucht ihn nicht,
     * sie hat `visibleUntil` je Grafik), wohl aber in die Render-Schleife des Kanals: sie stellt
     * sich daraus ihren Wecker (siehe [StreamSceneBroadcaster]).
     */
    data class ResolvedSceneView(val view: StreamSceneViewDto, val nextEvaluationAt: LocalDateTime?)

    /**
     * Der Schnappschuss für [resolveScene] - echte Daten, oder im Probemodus die Demo-Schleife.
     *
     * `trial_mode` schaltet die echten Quellen VOLLSTÄNDIG ab: keine Abfrage außer der
     * Grafik-Konfiguration läuft, damit ein Probelauf am Regattatag garantiert keine echten
     * Läufe anfasst und auch keine Last erzeugt.
     */
    fun buildInput(eventId: UUID, scene: StreamSceneRecord): App<Nothing, StreamResolverInput> =
        KIO.comprehension {
            val now = LocalDateTime.now()
            val sceneId = scene.id!!

            // Nur enabled-Zeilen: eine ausgeschaltete Grafik existiert für den Resolver nicht
            // (und darf deshalb auch keinen Platz belegen).
            val graphics = (!StreamSceneRepo.getGraphics(sceneId).orDie())
                .map { it.toDto() }
                .filter { it.enabled }

            // Auch im Probemodus geladen: eine Regie soll die Übersteuerung (Auto/An/Aus) an der
            // Demo-Schleife üben können, ohne dass dafür ein echter Wettkampf läuft (siehe
            // `trialInput`-Aufruf unten).
            val overrides = (!StreamOverrideRepo.findByScene(sceneId).orDie()).map { row ->
                StreamOverrideRow(
                    graphicType = StreamGraphicType.valueOf(row.graphicType),
                    state = StreamOverrideState.valueOf(row.state),
                    match = row.match,
                    expiresAt = row.expiresAt,
                    createdAt = row.createdAt,
                )
            }

            if (scene.trialMode == true) {
                return@comprehension KIO.ok(trialInput(now, graphics, overrides))
            }

            // Einmal je Aufbau, nicht je Mannschaft - dieselbe Begründung wie in
            // BoardService.getBoardView.
            val clubShortNames = !EventInfoService.clubShortNames()

            // Die aktivierten Läufe in Arena-Reihenfolge; die Info-Zeile (nicht das
            // Anzeige-DTO) trägt `activatedAt`, und genau der ist der Zeitpunkt des Wechsels
            // nach „In Vorbereitung".
            val runningInfos =
                (!EventInfoService.getRunningMatches(eventId, RUNNING_LIMIT, clubShortNames)).data
            val runningMatches = runningInfos.map {
                it.toAthleteBoardMatch(now, showCountdown = true, includeDetails = CREW_DETAILS)
            }

            val runningIndex = pickRunning(runningMatches)
            val preparingIndex = pickPreparing(runningMatches, runningInfos)
            val running = runningIndex?.let { runningMatches[it] }
            val preparing = preparingIndex?.let { runningMatches[it] }
            val preparingSince = preparingIndex?.let { runningInfos[it].activatedAt }

            // Der Lauf, dessen Einläufe das Band zeigt: der fahrende, sonst der am Steg
            // stehende (der hat noch keine Wertungen und liefert dann schlicht nichts).
            val finishEntries = finishEntriesOf(running ?: preparing)

            // Dieselbe Auswahl wie die „Letztes Ergebnis"-Kachel der Boards: confirmedOnly, also
            // ausschließlich BEENDETE Läufe. Ein voll gewerteter, aber nicht beendeter Lauf
            // fährt für die Szene noch (er steht im Running-Block mit Live-Zeiten) - er darf
            // nicht gleichzeitig als Ergebnis eingeblendet werden. Die Klärung hebt das nicht
            // auf: ein beendeter Lauf in Klärung geht raus, nur als vorläufig gekennzeichnet.
            val latestResultInfo = (!EventInfoService.getLatestMatchResults(
                eventId,
                LATEST_RESULT_LIMIT,
                null,
                clubShortNames,
                confirmedOnly = true,
            )).data.firstOrNull()

            // Inhalte der Regie-Auswahl („Ergebnis von Lauf 12"): nur für FORCED_ON-Zeilen mit
            // Lauf-Bezug, und nur solange der Eingriff nicht abgelaufen ist - für eine
            // abgelaufene Zeile gilt AUTO, ihr Inhalt wird nie gebraucht.
            val overrideMatchIds = overrides
                .filter { it.state == StreamOverrideState.FORCED_ON }
                .filter { it.expiresAt == null || it.expiresAt.isAfter(now) }
                .mapNotNull { it.match }
                .toSet()

            val needsSchedule = graphics.any { it.type == StreamGraphicType.SCHEDULE }
            val scheduleLength = graphics
                .firstOrNull { it.type == StreamGraphicType.SCHEDULE }
                ?.settings?.listLength ?: DEFAULT_SCHEDULE_LENGTH

            // Das Tagesprogramm zahlt nur eine Szene mit SCHEDULE-Grafik; die Regie-Auswahl
            // braucht denselben Block, um einen benannten anstehenden Lauf zu finden - und der
            // muss nicht der nächste sein, deshalb ein eigenes, größeres Suchfenster.
            val upcoming = if (needsSchedule || overrideMatchIds.isNotEmpty()) {
                val limit = maxOf(
                    if (needsSchedule) scheduleLength else 0,
                    if (overrideMatchIds.isNotEmpty()) OVERRIDE_LOOKUP_LIMIT else 0,
                )
                AthleteBoardLogic.sortByStartTime(
                    (!EventInfoService.getUpcomingMatchesForBoard(eventId, limit, clubShortNames)).data
                        .map { it.toAthleteBoardMatch(now, showCountdown = true, includeDetails = CREW_DETAILS) }
                ) { it.startTime }
            } else emptyList()

            // Ein benannter Lauf kann aktiviert, anstehend oder längst beendet sein. Die ersten
            // beiden liegen schon vor; für das Ergebnis fragt jede benannte Kennung einzeln
            // nach (höchstens acht Zeilen, eine je Grafiktyp, und in aller Regel keine).
            val overriddenMatches = (runningMatches + upcoming)
                .filter { it.matchId in overrideMatchIds }
                .associateBy { it.matchId }
            val overriddenResults = (!overrideMatchIds.toList().traverse { matchId ->
                EventInfoService.getLatestMatchResults(
                    eventId,
                    LATEST_RESULT_LIMIT,
                    null,
                    clubShortNames,
                    matchId = matchId,
                    confirmedOnly = true,
                ).map { response -> response.data.firstOrNull() }
            }).filterNotNull().associate { it.matchId to it.toAthleteBoardResult(includeDetails = true) }

            val timing = !sequenceTiming(eventId)

            KIO.ok(
                StreamResolverInput(
                    now = now,
                    graphics = graphics,
                    overrides = overrides,
                    preparing = preparing,
                    preparingSince = preparingSince,
                    running = running,
                    sequenceStartedAt = timing.startedAt,
                    sequenceFiresAt = timing.firesAt,
                    sequencePausedAt = timing.pausedAt,
                    latestResult = latestResultInfo?.toAthleteBoardResult(includeDetails = true),
                    latestResultAt = latestResultInfo?.updatedAt,
                    latestResultProvisional = latestResultInfo?.clarification == true,
                    finishEntries = finishEntries,
                    overriddenMatches = overriddenMatches,
                    overriddenResults = overriddenResults,
                    schedule = if (needsSchedule) upcoming.take(scheduleLength) else emptyList(),
                    courseImageUrl = courseImageUrl(eventId, graphics),
                )
            )
        }

    /** Der aufgelöste Szenenstand samt Umschaltpunkt — für den Kanal, siehe [ResolvedSceneView]. */
    fun buildResolvedView(eventId: UUID, sceneId: UUID): App<StreamError, ResolvedSceneView> =
        KIO.comprehension {
            val scene = !StreamSceneService.requireOwnedScene(eventId, sceneId)
            val input = !buildInput(eventId, scene)
            val resolved = resolveScene(input)

            // Im Probemodus treibt niemand die Szene: Es schreibt keiner, und die Demo-Schleife
            // wechselt ihre Phasen allein aus der Uhr heraus. Der Resolver kennt nur die
            // Einblendfenster (STARTLIST/LAPS/RESULT) und ließe die Szene danach einschlafen -
            // die Schleife stünde still. Deshalb kommt hier der nächste Punkt der Schleife dazu;
            // gewichtet wird nach „was zuerst fällig ist".
            val nextEvaluationAt = if (scene.trialMode == true) {
                listOfNotNull(resolved.nextEvaluationAt, nextTrialEvaluationAt(input.now)).minOrNull()
            } else {
                resolved.nextEvaluationAt
            }

            KIO.ok(
                ResolvedSceneView(
                    view = StreamSceneViewDto(
                        sceneId = sceneId,
                        background = scene.background?.let { StreamBackground.valueOf(it) }
                            ?: StreamBackground.TRANSPARENT,
                        chromaColor = scene.chromaColor,
                        safeAreaPercent = scene.safeAreaPercent ?: 0,
                        trialMode = scene.trialMode == true,
                        // Der Anker für die Uhr-Korrektur der Bühne, wie bei BoardViewDto.serverTime:
                        // dieselbe `now`, mit der aufgelöst wurde.
                        serverTime = input.now,
                        graphics = resolved.graphics,
                    ),
                    nextEvaluationAt = nextEvaluationAt,
                )
            )
        }

    /** Der Szenenstand für den GET-Einstieg — dieselbe Nutzlast wie der Push, ohne den Umschaltpunkt. */
    fun buildView(eventId: UUID, sceneId: UUID): App<StreamError, StreamSceneViewDto> =
        buildResolvedView(eventId, sceneId).map { it.view }

    /**
     * Der fahrende Lauf: bei mehreren gleichzeitig der ZULETZT gestartete (Spec-Regel, dieselbe
     * wie `BoardLogic.cursorIndex`). Der Block ist aufsteigend nach geplantem Start sortiert.
     */
    private fun pickRunning(matches: List<AthleteBoardMatch>): Int? =
        matches.indexOfLast { it.state == MatchState.RUNNING }.takeIf { it >= 0 }

    /**
     * Der Lauf am Steg: der zuletzt AKTIVIERTE, der noch nicht fährt - nicht der im Zeitplan
     * späteste.
     *
     * Der Block ist nach GEPLANTEM Start sortiert; „der letzte" wäre also der spätest geplante.
     * Genau das geht am Regattatag schief: Stehen zwei Läufe gleichzeitig in Vorbereitung (die
     * Kette aktiviert den Folgelauf, während eine Startgruppe noch am Steg wartet - real
     * vorgekommen), zeigte die Szene den falschen der beiden, nämlich den, der planmäßig später
     * dran ist statt den, der eben gerufen wurde. `activated_at` ist der Zeitpunkt genau dieses
     * Rufens und damit die richtige Ordnung. Ohne Zeitstempel (dürfte in diesem Block nicht
     * vorkommen, die Abfrage verlangt `activated_at is not null`) verliert der Lauf.
     */
    private fun pickPreparing(matches: List<AthleteBoardMatch>, infos: List<RunningMatchInfo>): Int? =
        matches.indices
            .filter { matches[it].state == MatchState.PREPARING }
            .maxByOrNull { infos[it].activatedAt ?: LocalDateTime.MIN }

    /**
     * Die Einläufe eines Laufs, in der Reihenfolge der Zieldurchfahrt. Gewertet heißt hier: das
     * Boot hat Platz UND Zeit - ein ausgefallenes oder abgemeldetes Boot ist nie durchs Ziel
     * gefahren und gehört nicht auf das Band.
     */
    private fun finishEntriesOf(match: AthleteBoardMatch?): List<StreamFinishEntry> =
        match?.teams.orEmpty()
            .filter { it.place != null && it.timeString != null && !it.failed && !it.deregistered }
            .sortedBy { it.place }
            .map { team ->
                StreamFinishEntry(
                    rank = team.place!!,
                    startNumber = team.startNumber,
                    clubsShort = team.clubsShort,
                    clubsFull = team.clubsFull,
                    timeString = team.timeString!!,
                    participants = team.participants.map { it.name },
                )
            }

    /** [sequenceTiming]: Anker, Feuerzeitpunkt und ggf. Pausenbeginn der laufenden Startsequenz. */
    private data class SequenceTiming(
        val startedAt: LocalDateTime?,
        val firesAt: LocalDateTime?,
        val pausedAt: LocalDateTime?,
    )

    /**
     * Anker und Feuerzeitpunkt der laufenden Startsequenz, oder alles null.
     *
     * Die Szene hängt nicht an einem bestimmten Posten: sie zeigt, wie eine unverknüpfte Anzeige,
     * die zuletzt angefasste aktive Sequenz der Veranstaltung - die Rechnung dazu (Anker mit
     * Pausenverschiebung, erster NOCH ANSTEHENDER Start, Pausenbeginn) liegt seit dem 02.09.2026
     * in `TimingSequenceService.activeTiming`, gemeinsam mit den Boards; hier bleibt nur der
     * Zuschnitt auf die drei Felder der CLOCK-Grafik. Eine nur scharfgestellte (ARMED) Sequenz
     * hat keinen Startzeitpunkt und zählt damit von selbst nicht.
     */
    private fun sequenceTiming(eventId: UUID): App<Nothing, SequenceTiming> = KIO.comprehension {
        val timing = !TimingSequenceService.activeTiming(eventId)
        KIO.ok(
            SequenceTiming(
                startedAt = timing?.startedAt,
                firesAt = timing?.firesAt,
                pausedAt = timing?.pausedAt,
            )
        )
    }

    /**
     * Die Adresse des Streckenbilds aus der Grafik-Konfiguration.
     *
     * Es liegt als Veranstaltungsdokument (`event_document`); ausgeliefert wird es vom
     * bestehenden Download-Endpunkt `GET /api/event/{eventId}/eventDocument/{id}`. Der verlangt
     * eine Sitzung mit READ EVENT - ein Szenen-Token öffnet ihn NICHT. Für das Panel und für
     * eine angemeldete Vorschau trägt die Adresse also, für eine reine Token-Bühne (Wirecast,
     * OBS) noch nicht; ein öffentlich bzw. per Szenen-Token erreichbarer Auslieferweg fehlt und
     * ist als offener Punkt an die Bühnen-Aufgaben notiert.
     */
    private fun courseImageUrl(eventId: UUID, graphics: List<StreamSceneGraphicDto>): String? =
        graphics.firstOrNull { it.type == StreamGraphicType.COURSE_IMAGE }
            ?.settings?.imageDocument
            ?.let { "/api/event/$eventId/eventDocument/$it" }
}
