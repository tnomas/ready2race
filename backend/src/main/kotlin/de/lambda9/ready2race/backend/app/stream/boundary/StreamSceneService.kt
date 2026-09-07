package de.lambda9.ready2race.backend.app.stream.boundary

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.competitionExecution.control.CompetitionMatchRepo
import de.lambda9.ready2race.backend.app.event.entity.PublicResultsVisibility
import de.lambda9.ready2race.backend.app.eventDocument.control.EventDocumentRepo
import de.lambda9.ready2race.backend.app.eventInfo.boundary.AthleteBoardLogic
import de.lambda9.ready2race.backend.app.stream.control.StreamOverrideRepo
import de.lambda9.ready2race.backend.app.stream.control.StreamSceneRepo
import de.lambda9.ready2race.backend.app.stream.control.toDto
import de.lambda9.ready2race.backend.app.stream.control.toJsonb
import de.lambda9.ready2race.backend.app.stream.entity.StreamError
import de.lambda9.ready2race.backend.app.stream.entity.StreamGraphicType
import de.lambda9.ready2race.backend.app.stream.entity.StreamTrialPhase
import de.lambda9.ready2race.backend.app.stream.entity.StreamOverrideRequest
import de.lambda9.ready2race.backend.app.stream.entity.StreamOverrideState
import de.lambda9.ready2race.backend.app.stream.entity.StreamPickerMatchDto
import de.lambda9.ready2race.backend.app.stream.entity.StreamPickerMatchState
import de.lambda9.ready2race.backend.app.stream.entity.StreamSceneDto
import de.lambda9.ready2race.backend.app.stream.entity.StreamSceneGraphicDto
import de.lambda9.ready2race.backend.app.stream.entity.StreamSceneRequest
import de.lambda9.ready2race.backend.app.stream.entity.StreamSceneShareLinkDto
import de.lambda9.ready2race.backend.app.stream.entity.allowedPlacements
import de.lambda9.ready2race.backend.app.timing.boundary.TimingDeviceTokenService
import de.lambda9.ready2race.backend.calls.responses.AfterCommit
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.calls.responses.ApiResponse.Companion.noData
import de.lambda9.ready2race.backend.database.generated.tables.records.StreamOverrideRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.StreamSceneGraphicRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.StreamSceneRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_MATCH
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_VIEW
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.onNullFail
import de.lambda9.tailwind.core.extensions.kio.orDie
import de.lambda9.tailwind.core.extensions.kio.traverse
import org.jooq.Record
import java.time.Duration
import java.time.LocalDateTime
import java.util.UUID

/**
 * Verwaltung der Livestream-Szenen (Task 5 der Domäne `app/stream`, Muster `liveDashboard` /
 * `BoardService`): Szenen-CRUD, Grafik-Konfiguration, Regie-Eingriffe (Override), Probemodus und
 * Szenen-Token. Rechteprüfung ist bewusst NICHT hier - die kommt an den Routen (Task 6).
 *
 * Anders als [de.lambda9.ready2race.backend.app.eventInfo.boundary.BoardService] (dessen
 * `updateBoard`/`deleteBoard` bewusst KEINE Veranstaltung entgegennehmen und die Zugehörigkeit
 * folglich nicht prüfen) verlangt hier jede szenen-adressierte Funktion die `eventId` aus dem
 * Pfad und prüft sie über [requireOwnedScene] - Task-6-Vorgabe: eine fremde `sceneId` darf sich
 * nicht in eine andere Veranstaltung hineinreichen lassen.
 *
 * Jeder schreibende Weg löst am Ende einen Broadcast auf den Szenen-Kanal aus
 * ([StreamSceneBroadcaster.broadcastScene]) - und zwar über [AfterCommit], genau wie die
 * Board-Konfiguration ihren `broadcastBoard` (siehe [de.lambda9.ready2race.backend.app.eventInfo.boundary.BoardService.updateBoard]):
 * Ein Push VOR dem Commit ließe die Bühne den alten Stand aufbauen. `EventChangeMarker.bump`
 * bleibt hier bewusst außen vor - eine Regie-Entscheidung betrifft eine einzelne Szene und darf
 * nicht die Zwischenspeicher aller öffentlichen Anzeigen entwerten.
 */
object StreamSceneService {

    /**
     * Meldet dem Szenen-Kanal, dass diese eine Szene neu aufzulösen ist - nach dem Commit, aus
     * demselben Grund wie im Zeitnahme-Kanal: Eine Bühne, die den Push sofort beantwortet, läse
     * sonst über eine andere Verbindung den Stand VOR dem Schreiben, und ein Rollback erzeugte
     * einen Push über eine Änderung, die es nie gab. [AfterCommit] puffert bis `respondKIO`
     * committet hat und feuert für Nicht-HTTP-Aufrufer (Jobs, Tests) unmittelbar.
     *
     * Kostet nichts, wenn niemand zusieht: Ohne Abonnenten kehrt `broadcastScene` sofort zurück.
     */
    private fun notifyScene(sceneId: UUID) {
        AfterCommit.register { StreamSceneBroadcaster.broadcastScene(sceneId) }
    }

    /**
     * Lädt die Szene und prüft ihre Zugehörigkeit zu [eventId] - EINE Stelle für die Prüfung,
     * an der jede szenen-adressierte Funktion dieses Objekts hängt. Auch die Route des
     * Szenenstands (`GET .../view`, Task 6) ruft das für ihren Sitzungszweig auf; der
     * Token-Zweig bekommt dieselbe Prüfung schon über
     * [de.lambda9.ready2race.backend.app.timing.boundary.TimingDeviceTokenService.validateForStreamScene].
     * Eine Szene, die es nicht gibt, und eine Szene einer ANDEREN Veranstaltung antworten
     * gleich - sonst verriete der Aufruf, welche Szenen-Kennungen existieren.
     */
    fun requireOwnedScene(eventId: UUID, sceneId: UUID): App<StreamError, StreamSceneRecord> = KIO.comprehension {
        val scene = !StreamSceneRepo.findById(sceneId).orDie().onNullFail { StreamError.SceneNotFound(sceneId) }
        !KIO.failOn(scene.event != eventId) { StreamError.SceneNotFound(sceneId) }

        KIO.ok(scene)
    }

    /**
     * Die Szenen einer Veranstaltung samt ihrer Grafik-Konfiguration - eine Abfrage für die
     * Grafikzeilen aller Szenen statt einer je Szene (Muster [de.lambda9.ready2race.backend.app.liveDashboard.boundary.LiveDashboardService]).
     */
    fun getScenes(eventId: UUID): App<Nothing, ApiResponse.ListDto<StreamSceneDto>> = KIO.comprehension {
        val scenes = !StreamSceneRepo.findByEvent(eventId).orDie()
        val graphicsByScene = !StreamSceneRepo.getGraphicsByScenes(scenes.mapNotNull { it.id }).orDie()
            .map { rows -> rows.groupBy { it.scene } }

        KIO.ok(
            ApiResponse.ListDto(
                scenes.map { scene ->
                    scene.toDto(graphicsByScene[scene.id].orEmpty().map { it.toDto() })
                }
            )
        )
    }

    /** Je Zustandsabschnitt maximal so viele Läufe — kein Query-Parameter, eine Regatta hat nie hunderte gleichzeitig relevante Läufe. */
    private const val PICKER_MATCH_LIMIT = 100

    /**
     * Läufe des Tages für den Lauf-Wähler des Kontroll-Panels (STARTLIST/RESULT/NEXT_UP-
     * Override). Anders als die öffentliche `getLiveMatches` (die einen Lauf fallen lässt, sobald
     * er beendet ist) ausdrücklich AUCH beendete Läufe — sonst wäre der namensgebende Leitfall
     * "Ergebnis von Lauf 12 erneut zeigen" gar nicht bedienbar.
     *
     * Beendete Läufe kommen UNABHÄNGIG von `Event.publicResultsVisibility` mit
     * ([PublicResultsVisibility.FINISHED_ONLY] fest verdrahtet, nicht aus der Veranstaltung
     * gelesen): Das Panel ist eine Verwaltungsfläche mit eigenem Leserecht (READ STREAM/READ
     * EVENT), keine öffentliche Ergebnisseite — eine Regie muss ein Ergebnis erzwingen können,
     * bevor es die Veranstaltung öffentlich freigibt.
     *
     * Reihenfolge: zuerst die zuletzt beendeten (neueste zuerst, `getMatchResults` sortiert schon
     * so — der Leitfall oben will genau das ganz oben), dann die laufenden, zuletzt die
     * anstehenden nach Startzeit. Die drei Abfragen sind dieselben, aus denen sich auch die
     * öffentliche `getLiveMatches`/`getLatestMatchResults` speisen (Muster
     * [de.lambda9.ready2race.backend.app.eventInfo.boundary.EventInfoService]) — keine zweite
     * Wahrheit über "was ist ein laufender/anstehender Lauf".
     */
    fun getPickerMatches(eventId: UUID): App<Nothing, ApiResponse.ListDto<StreamPickerMatchDto>> = KIO.comprehension {
        val grace = Duration.ofMinutes(AthleteBoardLogic.DEFAULT_OVERDUE_GRACE_MINUTES.toLong())

        val finished = !CompetitionMatchRepo.getMatchResults(
            eventId = eventId,
            competitionId = null,
            limit = PICKER_MATCH_LIMIT,
            visibility = PublicResultsVisibility.FINISHED_ONLY,
        ).orDie()
        val running = !CompetitionMatchRepo.getRunningMatches(eventId, PICKER_MATCH_LIMIT).orDie()
        val upcoming = !CompetitionMatchRepo.getUpcomingMatchesForBoard(eventId, PICKER_MATCH_LIMIT, grace).orDie()

        val result = finished.map { it.toPickerMatch(StreamPickerMatchState.FINISHED) } +
            running.map { it.toPickerMatch(StreamPickerMatchState.RUNNING) } +
            upcoming.map { it.toPickerMatch(StreamPickerMatchState.UPCOMING) }

        KIO.ok(ApiResponse.ListDto(result))
    }

    /**
     * Gemeinsame Zeilen-Zuordnung für alle drei Quellen von [getPickerMatches]: die Aliase
     * (`competition_name`/`round_name`/`match_name`) und Spalten (`COMPETITION_MATCH.START_TIME`,
     * `COMPETITION_VIEW.CATEGORY_NAME`) sind in `getMatchResults`, `getRunningMatches` und
     * `getUpcomingMatchesForBoard` bewusst gleich benannt (Muster `EventInfoService`).
     */
    private fun Record.toPickerMatch(state: StreamPickerMatchState): StreamPickerMatchDto = StreamPickerMatchDto(
        matchId = this[COMPETITION_MATCH.COMPETITION_SETUP_MATCH]!!,
        competitionName = this.get("competition_name", String::class.java) ?: "",
        categoryName = this[COMPETITION_VIEW.CATEGORY_NAME],
        roundName = this.get("round_name", String::class.java),
        matchName = this.get("match_name", String::class.java),
        startTime = this[COMPETITION_MATCH.START_TIME],
        state = state,
    )

    /**
     * Ohne [notifyScene]: An einer eben erst entstandenen Szene kann noch niemand hängen - es
     * gibt keinen Kanal, den man wecken könnte. Der erste Abonnent bekommt seinen Stand als
     * Begrüßungsrahmen (`StreamSceneBroadcaster.currentView`).
     */
    fun createScene(eventId: UUID, request: StreamSceneRequest): App<Nothing, ApiResponse.Dto<StreamSceneDto>> =
        KIO.comprehension {
            val now = LocalDateTime.now()
            val record = StreamSceneRecord(
                id = UUID.randomUUID(),
                event = eventId,
                name = request.name,
                background = request.background.name,
                chromaColor = request.chromaColor,
                safeAreaPercent = request.safeAreaPercent,
                trialMode = false,
                createdAt = now,
                updatedAt = now,
            )
            val created = !StreamSceneRepo.create(record).orDie()

            KIO.ok(ApiResponse.Dto(created.toDto()))
        }

    fun updateScene(
        eventId: UUID,
        sceneId: UUID,
        request: StreamSceneRequest,
    ): App<StreamError, ApiResponse.Dto<StreamSceneDto>> =
        KIO.comprehension {
            !requireOwnedScene(eventId, sceneId)

            val updated = !StreamSceneRepo.update(sceneId) {
                name = request.name
                background = request.background.name
                chromaColor = request.chromaColor
                safeAreaPercent = request.safeAreaPercent
                updatedAt = LocalDateTime.now()
            }.orDie().onNullFail { StreamError.SceneNotFound(sceneId) }

            val graphics = !StreamSceneRepo.getGraphics(sceneId).orDie().map { rows -> rows.map { it.toDto() } }

            // Hintergrund, Chroma-Farbe und Sicherheitsrand stehen im Szenenstand - die Bühne
            // soll sie sofort übernehmen, nicht erst beim nächsten Renn-Ereignis.
            notifyScene(sceneId)

            KIO.ok(ApiResponse.Dto(updated.toDto(graphics)))
        }

    /**
     * Löscht die Szene - Grafik-Konfiguration, Regie-Zeilen und ihr Token hängen per
     * `on delete cascade` daran (Migration V202608271000).
     *
     * Bewusst OHNE [notifyScene]: Für eine gelöschte Szene gibt es keinen Stand mehr zu bauen.
     * Ein Aufbau scheiterte an `SceneNotFound`, der Kanal verwürfe ihn, und die Bühne behielte
     * ohnehin ihr letztes Bild. Der Kanal verschwindet, sobald die verbundenen Clients die
     * Verbindung verlieren (Teardown beim letzten Abonnenten).
     */
    fun deleteScene(eventId: UUID, sceneId: UUID): App<StreamError, ApiResponse.NoData> = KIO.comprehension {
        !requireOwnedScene(eventId, sceneId)

        val deleted = !StreamSceneRepo.delete(sceneId).orDie()
        if (deleted < 1) {
            !KIO.fail<StreamError>(StreamError.SceneNotFound(sceneId))
        }

        noData
    }

    /**
     * Ersetzt die Grafik-Konfiguration der übergebenen Typen (Muster BoardConfig-Editor: pro
     * Aufruf die geänderten Zeilen, nicht zwingend alle acht Typen). Validiert JEDE Zeile gegen
     * [allowedPlacements], BEVOR irgendetwas geschrieben wird - eine einzige unerlaubte
     * Platzierung lehnt den ganzen Aufruf ab, statt die anderen Zeilen trotzdem zu übernehmen.
     */
    fun updateGraphics(
        eventId: UUID,
        sceneId: UUID,
        graphics: List<StreamSceneGraphicDto>,
    ): App<StreamError, ApiResponse.Dto<StreamSceneDto>> = KIO.comprehension {
        val scene = !requireOwnedScene(eventId, sceneId)

        val invalid = graphics.firstOrNull { allowedPlacements[it.type]?.contains(it.placement) != true }
        if (invalid != null) {
            !KIO.fail<StreamError>(StreamError.PlacementNotAllowed(invalid.type, invalid.placement))
        }

        !graphics.traverse { graphic ->
            StreamSceneRepo.upsertGraphic(
                StreamSceneGraphicRecord(
                    id = UUID.randomUUID(),
                    scene = sceneId,
                    type = graphic.type.name,
                    enabled = graphic.enabled,
                    placement = graphic.placement.name,
                    size = graphic.size.name,
                    settings = graphic.settings.toJsonb(),
                )
            ).orDie()
        }

        !StreamSceneRepo.update(sceneId) { updatedAt = LocalDateTime.now() }.orDie()

        val updatedGraphics = !StreamSceneRepo.getGraphics(sceneId).orDie().map { rows -> rows.map { it.toDto() } }

        notifyScene(sceneId)

        KIO.ok(ApiResponse.Dto(scene.toDto(updatedGraphics)))
    }

    /**
     * Regie-Eingriff für einen Grafiktyp: AUTO im Request heißt "Eingriff zurücknehmen" und läuft
     * auf denselben Weg wie [clearOverride] hinaus (keine Zeile = AUTO, siehe [StreamOverrideState]).
     * Bei FORCED_ON/FORCED_OFF ersetzt [StreamOverrideRepo.setOverride] die Zeile komplett - jeder
     * Aufruf ist damit "der jüngste Eingriff", was die Platz-Priorität im Resolver braucht.
     *
     * Ein FORCED_ON nimmt außerdem jedes andere FORCED_ON auf DEMSELBEN Platz zurück (Platz laut
     * Grafik-Konfiguration der Szene). Der Resolver ließe zwar die jüngere Zeile gewinnen, aber die
     * verdrängte bliebe liegen: Sie käme wieder hoch, sobald der Sieger abläuft, und das Panel
     * zeigte sie weiter als "erzwungen", obwohl sie nicht zu sehen ist. Wer eine zweite Grafik auf
     * den Platz zwingt, hat die erste damit gemeint zurückzunehmen.
     */
    fun setOverride(
        eventId: UUID,
        sceneId: UUID,
        type: StreamGraphicType,
        request: StreamOverrideRequest,
    ): App<StreamError, ApiResponse.NoData> = KIO.comprehension {
        !requireOwnedScene(eventId, sceneId)

        if (request.state == StreamOverrideState.AUTO) {
            !StreamOverrideRepo.delete(sceneId, type).orDie()
        } else {
            if (request.state == StreamOverrideState.FORCED_ON) {
                !StreamOverrideRepo.deleteForcedOn(sceneId, !competitorsOnSamePlacement(sceneId, type)).orDie()
            }
            val now = LocalDateTime.now()
            !StreamOverrideRepo.setOverride(
                StreamOverrideRecord(
                    id = UUID.randomUUID(),
                    scene = sceneId,
                    graphicType = type.name,
                    state = request.state.name,
                    match = request.match,
                    expiresAt = request.seconds?.let { now.plusSeconds(it.toLong()) },
                    createdAt = now,
                )
            ).orDie()
        }

        // Der Eingriff der Regie ist genau der Fall, für den es diesen Kanal gibt: Was das Panel
        // schaltet, muss auf der Bühne sofort passieren, nicht beim nächsten Renn-Ereignis.
        notifyScene(sceneId)

        noData
    }

    /**
     * Die anderen Grafiktypen der Szene, die laut Konfiguration auf demselben Platz liegen wie
     * [type]. Ohne Konfigurationszeile für [type] ist der Platz unbekannt - dann gibt es keine
     * Konkurrenten und nichts wird angefasst.
     */
    private fun competitorsOnSamePlacement(sceneId: UUID, type: StreamGraphicType): App<Nothing, List<StreamGraphicType>> =
        StreamSceneRepo.getGraphics(sceneId).orDie().map { rows ->
            val placement = rows.firstOrNull { it.type == type.name }?.placement ?: return@map emptyList()
            rows.filter { it.placement == placement && it.type != type.name }
                .map { StreamGraphicType.valueOf(it.type) }
        }

    /** Nimmt einen Regie-Eingriff zurück - keine Zeile heißt AUTO, ein fehlender Eingriff ist deshalb kein Fehler. */
    fun clearOverride(eventId: UUID, sceneId: UUID, type: StreamGraphicType): App<StreamError, ApiResponse.NoData> =
        KIO.comprehension {
            !requireOwnedScene(eventId, sceneId)
            !StreamOverrideRepo.delete(sceneId, type).orDie()

            notifyScene(sceneId)

            noData
        }

    fun setTrialMode(eventId: UUID, sceneId: UUID, trialMode: Boolean): App<StreamError, ApiResponse.NoData> =
        KIO.comprehension {
            !requireOwnedScene(eventId, sceneId)
            val now = LocalDateTime.now()
            !StreamSceneRepo.update(sceneId) {
                this.trialMode = trialMode
                // Einschalten löst die gewählte Phase frisch aus: Ihre Einblendfenster
                // (Startliste, Zwischenzeiten, Ergebnis) laufen ab jetzt, nicht ab einem Klick
                // von vor einer Stunde.
                if (trialMode) trialPhaseSince = now
                updatedAt = now
            }.orDie().onNullFail { StreamError.SceneNotFound(sceneId) }

            // Der Probemodus wechselt die ganze Datenquelle - die Bühne muss sofort umschalten,
            // sonst zeigte sie bis zum nächsten Ereignis noch die andere Welt.
            notifyScene(sceneId)

            noData
        }

    /**
     * Schaltet den Demo-Lauf des Probemodus in [phase] - der Phasenbeginn ist immer JETZT, auch
     * wenn dieselbe Phase noch einmal gewählt wird: Genau so löst die Regie ein abgelaufenes
     * Einblendfenster erneut aus (siehe `trialInput`). Wirkt erst mit eingeschaltetem Probemodus,
     * wird aber unabhängig davon gespeichert, damit die Wahl das Umschalten überlebt.
     */
    fun setTrialPhase(eventId: UUID, sceneId: UUID, phase: StreamTrialPhase): App<StreamError, ApiResponse.NoData> =
        KIO.comprehension {
            !requireOwnedScene(eventId, sceneId)
            val now = LocalDateTime.now()
            !StreamSceneRepo.update(sceneId) {
                trialPhase = phase.name
                trialPhaseSince = now
                updatedAt = now
            }.orDie().onNullFail { StreamError.SceneNotFound(sceneId) }

            notifyScene(sceneId)

            noData
        }

    /**
     * Das Streckenbild der Szene als Datei - der Auslieferweg, den [StreamSceneLogic.buildInput]
     * in `imageUrl` einträgt. Der allgemeine Dokument-Download verlangt eine Sitzung mit READ
     * EVENT; eine reine Token-Bühne (Wirecast, OBS) käme über ihn nie an ihr Bild. Deshalb hängt
     * das Bild hier hinter derselben Tür wie der Szenenstand (Route `GET .../courseImage`).
     *
     * Das Dokument muss zur Veranstaltung der Szene gehören: Die Grafik-Konfiguration trägt eine
     * freie UUID, und über eine eigene Szene darf sich kein fremdes Dokument herausholen lassen.
     * Alle Fehlfälle antworten gleich ([StreamError.CourseImageNotFound]), damit der Weg nicht
     * verrät, welche Dokument-Kennungen es gibt.
     */
    fun getCourseImage(eventId: UUID, sceneId: UUID): App<StreamError, ApiResponse.File> = KIO.comprehension {
        !requireOwnedScene(eventId, sceneId)

        val documentId = (!StreamSceneRepo.getGraphics(sceneId).orDie())
            .firstOrNull { it.type == StreamGraphicType.COURSE_IMAGE.name }
            ?.toDto()?.settings?.imageDocument
        !KIO.failOn(documentId == null) { StreamError.CourseImageNotFound(sceneId) }

        val document = !EventDocumentRepo.getDownload(documentId!!).orDie()
            .onNullFail { StreamError.CourseImageNotFound(sceneId) }
        !KIO.failOn(document.event != eventId) { StreamError.CourseImageNotFound(sceneId) }

        KIO.ok(ApiResponse.File(name = document.name!!, bytes = document.data!!))
    }

    /**
     * Stellt (bzw. gibt erneut) den geteilten Link samt Geräte-Token für die Szene aus - reiner
     * Durchgriff auf [TimingDeviceTokenService.shareLinkForStreamScene], das die eigentliche
     * Token-Infrastruktur trägt (Muster Board: dieselbe Aufteilung zwischen Fach- und
     * Token-Dienst).
     */
    fun createShareLink(
        eventId: UUID,
        sceneId: UUID,
        userId: UUID,
    ): App<StreamError, ApiResponse.Dto<StreamSceneShareLinkDto>> =
        TimingDeviceTokenService.shareLinkForStreamScene(eventId, sceneId, userId)
}
