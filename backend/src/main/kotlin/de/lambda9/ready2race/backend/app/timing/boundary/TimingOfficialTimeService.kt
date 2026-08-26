package de.lambda9.ready2race.backend.app.timing.boundary

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.ServiceError
import de.lambda9.ready2race.backend.app.competitionExecution.boundary.CompetitionExecutionService
import de.lambda9.ready2race.backend.app.competitionExecution.control.CompetitionMatchTeamRepo
import de.lambda9.ready2race.backend.app.event.control.EventRepo
import de.lambda9.ready2race.backend.app.event.entity.EventError
import de.lambda9.ready2race.backend.app.eventInfo.boundary.EventChangeMarker
import de.lambda9.ready2race.backend.app.timecode.control.TimecodeRepo
import de.lambda9.ready2race.backend.app.timecode.control.toRecord
import de.lambda9.ready2race.backend.app.timing.control.*
import de.lambda9.ready2race.backend.app.timing.entity.*
import de.lambda9.ready2race.backend.app.timingConfig.entity.TimingPrecision
import de.lambda9.ready2race.backend.calls.responses.AfterCommit
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.calls.responses.ApiResponse.Companion.noData
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionMatchTeamRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingOfficialTimeRecord
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.onNullFail
import de.lambda9.tailwind.core.extensions.kio.orDie
import de.lambda9.tailwind.core.extensions.kio.traverse
import java.time.LocalDateTime
import java.util.UUID

/**
 * The official-time layer of the Leitstand.
 *
 * Time marks are raw material: this service turns them into one official time per
 * `competition_match_team` (computed, or manually overridden, plus penalties and DNS/DNF/DSQ) and
 * writes that result to the match team.
 *
 * **Echtzeit ist der Normalfall:** [recomputeAndApply] läuft nach jeder Mutation an Marken,
 * Zuordnungen und Strafen - im selben Request, nicht über einen Poller. Ob dabei wirklich
 * geschrieben wird, entscheidet [TimingApplyLogic] anhand des Schalters „Automatische Übernahme"
 * (`event.timing_auto_apply`) und des Fingerabdrucks des zuletzt geschriebenen Stands: unverändert
 * heißt kein Doppelschreiben, fremd (Schiedsrichter, Import) heißt niemals stillschweigend
 * überschreiben - solche Zeilen zeigen die Abweichung als [TimingOfficialTimeRecord.dirty].
 *
 * **Mit der Zeit kommt der Platz:** Die Übernahme arbeitet je LAUF, nicht je Team - nach dem
 * Schreiben der Zeiten leitet sie die Plätze des Laufs aus den Zeiten ab
 * ([TimingApplyLogic.derivePlaces], Gleichstände auf der veröffentlichten Genauigkeitsstufe teilen
 * sich den Platz: 1, 1, 3) und schreibt sie mit - auch vorläufig, solange noch Boote unterwegs
 * sind; die Plätze wandern dann mit jedem weiteren Zieleinlauf. Der geschriebene Platz gehört zum
 * Fingerabdruck: eigene Platz-Fortschreibungen sind nie Fremdänderungen, ein von Hand gesetzter
 * Platz friert dagegen weiterhin ein. `finished_at` und die Rundenkette bleiben unberührt -
 * beendet wird ein Lauf ausschließlich dort, wo er heute beendet wird.
 *
 * Der manuelle [pushOfficialTimes]-Weg bleibt daneben bestehen: er ist der einzige, der eine
 * eingefrorene Zeile (`force`) überschreiben kann, und der Weg für Ereignisse mit ausgeschaltetem
 * Schalter. Auch er schreibt die Plätze des betroffenen Laufs mit.
 */
object TimingOfficialTimeService {

    /** Start and finish instant a computation would use for one team. */
    private data class TeamMarkTimes(
        val startMillis: Long?,
        val finishMillis: Long?,
    )

    /**
     * Die beiden Veranstaltungs-Einstellungen, die jede Übernahme braucht - einmal pro Aufruf
     * gelesen und durchgereicht, statt je Team erneut an die Datenbank zu gehen.
     */
    private data class EventTimingSettings(
        val autoApply: Boolean,
        val precision: TimingPrecision,
        /** Zeigt das START-Board den manuellen Stempel? Vorgabe der Spalte ist `false`. */
        val showManualCapture: Boolean,
        /** Anzeige-Block des Startbildschirms, aufgelöst - siehe [toDto]. */
        val startDisplay: StartDisplaySettings,
        /** Der aufgelöste Vorgabesatz der Ton-Sätze - siehe [TimingSettingsDto.defaultToneSet]. */
        val defaultToneSet: ResolvedToneSet,
    ) {
        /** Die eine Stelle, die aus dem internen Stand die Board-Sicht baut (GET + Broadcast). */
        fun toDto() = TimingSettingsDto(
            autoApply = autoApply,
            precision = precision,
            showManualCapture = showManualCapture,
            startDisplay = startDisplay,
            defaultToneSet = defaultToneSet,
        )
    }

    // ------------------------------------------------------------------ Echtzeit-Rückschreibung

    /**
     * Herzstück der Echtzeit-Übernahme: berechnet die offiziellen Zeiten von [teamIds] neu und
     * schreibt sie - Schalter und [TimingApplyLogic] erlaubend - sofort an die Läufe zurück,
     * einschließlich der daraus abgeleiteten Plätze des jeweiligen Laufs.
     *
     * Der Zuschnitt ist der Lauf: Auch Teams, die selbst nicht in [teamIds] stehen, können sich
     * ändern, weil ein neu eingelaufenes Boot die Plätze der anderen verschiebt - sie sind dann
     * Teil der Rückgabe.
     *
     * Sendet selbst **keine** Broadcasts und bumpt **keinen** [EventChangeMarker]: der
     * Startsequenz-Job ruft dies innerhalb der Scheduler-Transaktion auf, wo kein
     * AfterCommit-Puffer installiert ist (siehe [FireResult]). Die geänderten Zeilen und das
     * Schreib-Flag kommen deshalb als Rückgabe ([OfficialTimeApplyOutcome]), und HTTP-Aufrufer
     * nehmen [recomputeApplyAndBroadcast].
     */
    fun recomputeAndApply(
        eventId: UUID,
        teamIds: List<UUID>,
        userId: UUID?,
    ): App<Nothing, OfficialTimeApplyOutcome> = KIO.comprehension {
        val distinct = teamIds.distinct()
        if (distinct.isEmpty()) return@comprehension KIO.ok(OfficialTimeApplyOutcome.empty)

        val markTimes = !resolveMarkTimes(eventId)
        val settings = !eventSettings(eventId)
        val now = LocalDateTime.now()

        // 1) Rechenergebnis (finish - start) der ausgelösten Teams nachführen.
        val recomputeChanged = !distinct.traverse { teamId ->
            recomputeTeam(eventId, teamId, markTimes[teamId], userId, now)
                .map { changed -> teamId.takeIf { changed } }
        }.map { it.filterNotNull() }

        // 2) Übernahme + Platzableitung je betroffenem Lauf - der Lauf ist der Zuschnitt, weil
        //    ein einzelnes Ergebnis die Plätze aller anderen Boote des Laufs verschieben kann.
        val matchIds = !distinct.traverse { teamId -> CompetitionMatchTeamRepo.getById(teamId).orDie() }
            .map { records -> records.mapNotNull { it?.competitionMatch }.distinct() }
        val applyOutcomes = !matchIds.traverse { matchId ->
            applyMatch(matchId, settings, userId, now)
        }
        val applyChanged = applyOutcomes.flatMap { it.changedTeams }

        // Gemeldet wird der frische Stand ALLER ausgelösten Teams (auch ohne Schreibvorgang)
        // plus aller Boote, deren Platz durch die Übernahme gewandert ist: Der Aufruf kommt stets
        // von einer Mutation an den ausgelösten Teams, und Leitstand/Boards brauchen deren
        // Start-/Zielwerte live, um den Grund einer (noch) fehlenden Zeit zu zeigen ("kein
        // Start", "kein Ziel"). Teams ganz ohne Marken und Zeile bleiben stumm (officialTimeDtos).
        officialTimeDtos(eventId, (distinct + recomputeChanged + applyChanged).distinct(), markTimes)
            .map { dtos -> OfficialTimeApplyOutcome(dtos, applyOutcomes.any { it.resultsWritten }) }
    }

    /**
     * [recomputeAndApply] plus Broadcast nach Commit - der Weg für alle HTTP-Mutationen.
     *
     * Gibt zurück, ob an `competition_match_team` geschrieben oder geräumt wurde: der Aufrufer
     * entscheidet daran über den [EventChangeMarker]-Bump für die öffentlichen Anzeigen - beim
     * Aufrufer statt hier, damit eine Mutation, die zusätzlich einen Laufzustands-Stempel setzt
     * (Zuordnung, Reaktivierung), beides zu genau EINEM Bump zusammenlegen kann.
     */
    fun recomputeApplyAndBroadcast(
        eventId: UUID,
        teamIds: List<UUID>,
        userId: UUID?,
    ): App<Nothing, Boolean> = KIO.comprehension {
        val outcome = !recomputeAndApply(eventId, teamIds, userId)
        broadcastAsync(eventId, outcome.officialTimes)
        KIO.ok(outcome.resultsWritten)
    }

    /**
     * Führt das Rechenergebnis eines Teams nach. Anders als der frühere Rechenknopf räumt die
     * Neuberechnung einen Maschinenwert auch wieder AB, wenn seine Grundlage weg ist (Marke
     * zurückgenommen/umgehängt) - sonst stünde am Lauf eine Zeit, die es nicht mehr gibt.
     *
     * Gibt zurück, ob sich `computed_millis` geändert hat - der Broadcast bleibt so auf das
     * Nötige beschränkt.
     */
    private fun recomputeTeam(
        eventId: UUID,
        teamId: UUID,
        times: TeamMarkTimes?,
        userId: UUID?,
        now: LocalDateTime,
    ): App<Nothing, Boolean> = KIO.comprehension {
        val computable = times != null && skipReason(times) == null
        val record = !TimingOfficialTimeRepo.getByTeam(teamId).orDie()

        if (computable) {
            val millis = times!!.finishMillis!! - times.startMillis!!
            if (record == null || record.computedMillis != millis) {
                !upsert(eventId, teamId, userId, now) { computedMillis = millis }
                KIO.ok(true)
            } else {
                KIO.ok(false)
            }
        } else if (record?.computedMillis != null) {
            !updateExisting(teamId, userId, now) { computedMillis = null }
            KIO.ok(true)
        } else {
            KIO.ok(false)
        }
    }

    /**
     * Übernahme und Platzableitung für EINEN Lauf: erst das Zukunftsbild des Laufs bestimmen (was
     * steht nach dieser Übernahme an jedem Boot?), daraus die Plätze ableiten, dann je Team über
     * [TimingApplyLogic] entscheiden und schreiben.
     *
     * Fremde Stände - auch fremde Plätze - werden nie angefasst; ihre ZEITEN zählen aber bei der
     * Platzableitung mit, denn der Platz eines eigenen Bootes hängt am ganzen Feld.
     *
     * Gibt die Team-Ids zurück, an deren Zeile oder Ergebnis sich etwas geändert hat - und
     * getrennt davon, ob dabei wirklich an `competition_match_team` geschrieben wurde: eine bloße
     * dirty-Fortschreibung der Leitstand-Zeile ändert die öffentlichen Anzeigen nicht und darf
     * deshalb keinen Bump auslösen.
     */
    private data class MatchApplyOutcome(
        val changedTeams: List<UUID>,
        val resultsWritten: Boolean,
    )

    /** Was [applyToTeam] an einer Zeile verändert hat - Grundlage der [MatchApplyOutcome]-Trennung. */
    private enum class TeamApplyChange {
        /** Nichts zu tun (Idempotenz, nichts zu schreiben, unveränderte dirty-Lage). */
        NONE,

        /** Nur die Leitstand-Zeile (dirty-Kennzeichen) - kein Schreiben am Lauf. */
        ROW_ONLY,

        /** Ergebnis an `competition_match_team` geschrieben oder geräumt. */
        TEAM_WRITTEN,
    }

    private fun applyMatch(
        matchId: UUID,
        settings: EventTimingSettings,
        userId: UUID?,
        now: LocalDateTime,
    ): App<Nothing, MatchApplyOutcome> = KIO.comprehension {
        val teams = !CompetitionMatchTeamRepo.getByMatch(matchId).orDie()
        val ids = teams.mapNotNull { it.id }
        val officials = (!TimingOfficialTimeRepo.getByTeams(ids).orDie())
            .associateBy { it.competitionMatchTeam }
        val teamStates = !teams.traverse { team ->
            resolveTeamState(team).map { state -> team.id!! to state }
        }.map { it.toMap() }

        val places = deriveMatchPlaces(teams, officials, teamStates) { team, official, teamState ->
            val ownable = official != null && fingerprintOrNull(teamState) == official.appliedFingerprint
            if (settings.autoApply && ownable) {
                // Unser Boot: es zählt der Stand, den diese Übernahme gleich schreibt (bzw. das
                // Abräumen, wenn die Grundlage weg ist).
                targetState(official!!, settings.precision)
                    .let { if (it.hasResult) it else TimingApplyLogic.ResultState.empty }
            } else {
                // Fremd oder Schalter aus: es zählt, was am Boot steht.
                teamState
            }
        }

        val changes = !teams.traverse { team ->
            KIO.comprehension {
                // Ohne Zeile gibt es nichts zu übernehmen und nichts abzuräumen - insbesondere
                // bleibt ein fremder Platz eines solchen Teams unangetastet.
                val official = officials[team.id]
                    ?: return@comprehension KIO.ok(team.id!! to TeamApplyChange.NONE)
                val base = targetState(official, settings.precision)
                val target = base.copy(place = places[team.id!!], placesCalculated = base.hasResult)
                applyToTeam(official, team, target, teamStates[team.id!!]!!, settings, userId, now)
                    .map { change -> team.id!! to change }
            }
        }

        KIO.ok(
            MatchApplyOutcome(
                changedTeams = changes.filter { (_, change) -> change != TeamApplyChange.NONE }
                    .map { (teamId, _) -> teamId },
                resultsWritten = changes.any { (_, change) -> change == TeamApplyChange.TEAM_WRITTEN },
            )
        )
    }

    /**
     * Das Zukunftsbild eines Laufs und die daraus abgeleiteten Plätze: [futureState] beantwortet
     * je Boot, welcher Ergebnisstand nach dem anstehenden Schreiben am Lauf stehen wird; gewertet
     * werden alle Boote mit Zeit und ohne Ausfallstatus. Gleichstände nach
     * [TimingApplyLogic.derivePlaces] (1, 1, 3).
     */
    private fun deriveMatchPlaces(
        teams: List<CompetitionMatchTeamRecord>,
        officials: Map<UUID, TimingOfficialTimeRecord>,
        teamStates: Map<UUID, TimingApplyLogic.ResultState>,
        futureState: (CompetitionMatchTeamRecord, TimingOfficialTimeRecord?, TimingApplyLogic.ResultState) -> TimingApplyLogic.ResultState,
    ): Map<UUID, Int> {
        val candidates = teams.mapNotNull { team ->
            val future = futureState(team, officials[team.id], teamStates[team.id!!]!!)
            val time = future.timeMillis
            if (future.statusText == null && time != null && team.out != true) {
                TimingApplyLogic.PlaceCandidate(team.id!!, time)
            } else null
        }
        return TimingApplyLogic.derivePlaces(candidates)
    }

    /** Der Fingerabdruck eines Team-Stands, oder null für ein leeres Team - das Gegenstück zum nie geschriebenen Abdruck. */
    private fun fingerprintOrNull(state: TimingApplyLogic.ResultState): String? =
        if (state.isEmpty) null else TimingApplyLogic.fingerprint(state)

    /**
     * Der Übernahme-Schritt für eine Zeile: Entscheidung über [TimingApplyLogic], dann derselbe
     * Schreibweg, den auch die manuelle Übernahme nutzt ([writeResult]) - bzw. sein Gegenstück
     * [clearResult], wenn unser eigenes Ergebnis seine Grundlage verloren hat. [target] trägt den
     * abgeleiteten Platz bereits.
     *
     * Gibt zurück, WAS sich geändert hat ([TeamApplyChange]) - der Aufrufer braucht die
     * Unterscheidung "Team geschrieben" vs. "nur Zeile", weil nur ersteres die öffentlichen
     * Anzeigen betrifft.
     */
    private fun applyToTeam(
        official: TimingOfficialTimeRecord,
        team: CompetitionMatchTeamRecord,
        target: TimingApplyLogic.ResultState,
        teamState: TimingApplyLogic.ResultState,
        settings: EventTimingSettings,
        userId: UUID?,
        now: LocalDateTime,
    ): App<Nothing, TeamApplyChange> = KIO.comprehension {
        val decision = TimingApplyLogic.decide(
            autoApply = settings.autoApply,
            target = target,
            appliedFingerprint = official.appliedFingerprint,
            teamState = teamState,
        )

        when (decision) {
            TimingApplyLogic.Decision.WriteResult -> {
                !writeResult(team, target, settings.precision, userId, now)
                !updateExisting(official.competitionMatchTeam, userId, now) {
                    pushedAt = now
                    dirty = false
                    appliedFingerprint = TimingApplyLogic.fingerprint(target)
                }
                // Dieselbe Regel wie beim manuellen Weg: ein Schreiben auf die Felder, die auch der
                // RaceClocker-Abruf schreibt, pausiert einen konfigurierten Auto-Abruf. No-op ohne
                // RaceClocker am Lauf.
                !CompetitionExecutionService.pauseRaceClockerAutoPull(team.competitionMatch!!)
                KIO.ok(TeamApplyChange.TEAM_WRITTEN)
            }

            TimingApplyLogic.Decision.ClearResult -> {
                !clearResult(team, userId, now)
                !updateExisting(official.competitionMatchTeam, userId, now) {
                    pushedAt = null
                    dirty = false
                    appliedFingerprint = null
                }
                !CompetitionExecutionService.pauseRaceClockerAutoPull(team.competitionMatch!!)
                KIO.ok(TeamApplyChange.TEAM_WRITTEN)
            }

            else -> {
                val targetFingerprint = if (target.hasResult) TimingApplyLogic.fingerprint(target) else null
                val newDirty = TimingApplyLogic.dirtyAfter(
                    decision,
                    hasTarget = target.hasResult,
                    targetFingerprint = targetFingerprint,
                    appliedFingerprint = official.appliedFingerprint,
                )
                if ((official.dirty ?: false) != newDirty) {
                    !updateExisting(official.competitionMatchTeam, userId, now) { dirty = newDirty }
                    KIO.ok(TeamApplyChange.ROW_ONLY)
                } else {
                    KIO.ok(TeamApplyChange.NONE)
                }
            }
        }
    }

    // ------------------------------------------------------------------ Einstellungen

    /**
     * Schalter und Genauigkeit in einem Fetch - siehe [TimingSettingsDto] für die Begründung des
     * gemeinsamen Endpunkts. Lesbar auch mit Geräte-Token (Route), weil die Boards die Genauigkeit
     * für die Anzeige der offiziellen Zeiten brauchen.
     */
    fun getSettings(
        eventId: UUID,
    ): App<ServiceError, ApiResponse.Dto<TimingSettingsDto>> = KIO.comprehension {
        val settings = !eventSettings(eventId)
        KIO.ok(ApiResponse.Dto(settings.toDto()))
    }

    /**
     * Persistiert den Schalter. Einschalten zieht den aufgelaufenen Stand einmalig nach (alle
     * Teams, die Marken oder eine Zeile haben); Ausschalten hält nur künftige Schreibvorgänge an -
     * bereits geschriebene Ergebnisse bleiben stehen.
     */
    fun setAutoApply(
        eventId: UUID,
        request: TimingAutoApplyRequest,
        userId: UUID,
    ): App<ServiceError, ApiResponse.NoData> = KIO.comprehension {
        val event = !EventRepo.get(eventId).orDie().onNullFail { EventError.NotFound }
        !EventRepo.update(event) {
            timingAutoApply = request.enabled
            updatedBy = userId
            updatedAt = LocalDateTime.now()
        }.orDie()

        if (request.enabled) {
            !recomputeApplyEvent(eventId, userId)
        }
        !broadcastSettingsAsync(eventId)
        noData
    }

    /**
     * Zieht die Übernahme für ALLE Teams der Veranstaltung nach, die Marken oder eine Zeile haben.
     * Zwei Auslöser brauchen genau das: das Einschalten des Schalters ([setAutoApply]) und eine
     * geänderte Genauigkeit (TimingConfigService.updateEventTimingConfig) - im zweiten Fall rechnet
     * die Übernahme alle eigenen Zeilen auf die neue Stufe um, ohne sie als dirty/fremd zu
     * missdeuten, weil der Fingerabdruck stets den abgeschnittenen Stand trägt. Mit der Stufe
     * folgen auch die Plätze: Was auf der neuen Stufe zeitgleich ist, teilt sich fortan den Platz.
     */
    fun recomputeApplyEvent(
        eventId: UUID,
        userId: UUID,
    ): App<Nothing, Unit> = KIO.comprehension {
        val markTimes = !resolveMarkTimes(eventId)
        val rows = !TimingOfficialTimeRepo.getByEvent(eventId).orDie()
        val teams = (markTimes.keys + rows.map { it.competitionMatchTeam }).toList()
        val written = !recomputeApplyAndBroadcast(eventId, teams, userId)
        // Der Nachzug gilt für die Veranstaltung, also auch für ihre Zwischenzeiten - sie hängen
        // an denselben Marken.
        val splitsChanged = !TimingSplitService.recomputeEvent(eventId, userId)
        // Hat der Nachzug Ergebnisse an die Läufe geschrieben, müssen die öffentlichen Anzeigen
        // sie sofort sehen - EIN Bump für den ganzen Nachzug, nicht einer je Team. Ohne
        // Schreibvorgang (nichts aufgelaufen) bleibt es still.
        if (written || splitsChanged) {
            EventChangeMarker.bump(eventId)
        }
        KIO.ok(Unit)
    }

    /**
     * Meldet den aktuellen Einstellungs-Stand an alle verbundenen Leitstände und Boards - nach
     * Commit, wie jeder Broadcast dieser Schicht. So folgt die Anzeige einer Genauigkeits- oder
     * Schalter-Änderung live, ohne dass ein Board neu geladen werden muss.
     */
    fun broadcastSettingsAsync(eventId: UUID): App<Nothing, Unit> = KIO.comprehension {
        val settings = !eventSettings(eventId)
        AfterCommit.register {
            TimingBroadcaster.broadcast(
                eventId,
                TimingWsMessage.SettingsChanged(settings.toDto()),
            )
        }
        KIO.ok(Unit)
    }

    private fun eventSettings(eventId: UUID): App<Nothing, EventTimingSettings> = KIO.comprehension {
        val event = !EventRepo.get(eventId).orDie()
        // Zweite Abfrage, weil der Rückfall des großen Erfassungsknopfs im VORGABESATZ steht und
        // nicht mehr an der Veranstaltung. Sie gehört hierher und nicht in den Aufrufer: Diese
        // Stelle baut die Board-Sicht sowohl für GET /timing/settings als auch für den
        // settingsChanged-Broadcast - eine zweite Baustelle wären zwei Stände, die auseinanderlaufen.
        val toneSets = !TimingToneSetRepo.getByEvent(eventId).orDie()
        KIO.ok(
            EventTimingSettings(
                autoApply = event?.timingAutoApply ?: true,
                // Spalte ist NOT NULL mit Default; jOOQ typisiert sie dennoch nullable (bekanntes
                // Muster, siehe EventTimingConfigDto) - der Datenbank-Default ist die Rückfalllinie.
                precision = event?.timingPrecision?.let { TimingPrecision.valueOf(it) }
                    ?: TimingPrecision.ZEHNTEL,
                // Spalte ist NOT NULL mit Vorgabe `false` (Migration V202608242000); jOOQ
                // typisiert sie dennoch nullable - dieselbe Rückfalllinie wie beim Schalter oben.
                showManualCapture = event?.timingShowManualCapture ?: false,
                // null = unkonfiguriert: der Startbildschirm bekommt immer einen vollständigen
                // Anzeige-Block, deshalb werden die eingebauten Vorgaben schon hier aufgelöst
                // statt in jedem Client - genau wie beim Vorgabesatz darunter.
                startDisplay = event?.timingStartDisplay.toStartDisplaySettings()
                    ?: TimingStartDisplayLimits.DEFAULT,
                // Kein Vorgabesatz (Veranstaltung ohne Sätze) heißt: die eingebauten Töne. Damit
                // klingt der Knopf auch dort, wo nie jemand einen Satz angelegt hat.
                defaultToneSet = TimingToneResolveLogic.resolveDefault(toneSets),
            )
        )
    }

    // ------------------------------------------------------------------ Berechnung (Endpunkt)

    /**
     * Recomputes `finish - start` for [teams] (all teams of the event when null).
     *
     * Läuft über dieselbe Maschine wie jede Mutation ([recomputeAndApply]), inklusive der
     * sofortigen Übernahme - der Endpunkt existiert für API-Nutzer weiter, der frühere
     * Leitstand-Knopf dazu ist entfallen. Everything the computation cannot form a time from is
     * reported back with a reason instead of being silently ignored; existing rows keep their
     * override, penalty and status.
     */
    fun computeOfficialTimes(
        eventId: UUID,
        userId: UUID,
        teams: List<UUID>? = null,
    ): App<ServiceError, ApiResponse.Dto<OfficialTimeComputeResultDto>> = KIO.comprehension {
        val markTimes = !resolveMarkTimes(eventId)
        val candidates = markTimes.filterKeys { teams == null || teams.contains(it) }

        val classified = candidates.entries
            // Stable output order so a Leitstand table does not reshuffle between recomputes.
            .sortedBy { (_, times) -> times.finishMillis ?: times.startMillis }
            .map { (teamId, times) -> Triple(teamId, times, skipReason(times)) }

        // An id the caller named explicitly has no entry in `markTimes` at all when it has no marks
        // whatsoever - it would otherwise vanish from the response without a trace instead of
        // showing up in `skipped` like every other uncomputable team does.
        val withoutAnyMarks = teams.orEmpty().filter { !markTimes.containsKey(it) }

        val skipped = classified.mapNotNull { (teamId, _, reason) ->
            reason?.let { OfficialTimeSkipDto(teamId, it) }
        } + withoutAnyMarks.map { OfficialTimeSkipDto(it, OfficialTimeSkipReason.NO_MARKS) }

        val affected = (candidates.keys + teams.orEmpty()).toList()
        val outcome = !recomputeAndApply(eventId, affected, userId)
        broadcastAsync(eventId, outcome.officialTimes)
        // Der Endpunkt ist der "alles neu rechnen"-Knopf, und die Zwischenzeiten hängen an
        // denselben Marken - er muss sie mitziehen können. Der Zuschnitt auf [teams] gilt für sie
        // nicht: Die Zwischenzeiten werden ohnehin je Veranstaltung gerechnet, und ein Knopf, der
        // eine Abweichung nur halb repariert, wäre schlimmer als keiner.
        val splitsChanged = !TimingSplitService.recomputeEvent(eventId, userId)
        // Wie bei jeder Mutation: nur ein echter Schreibvorgang am Lauf entwertet die Caches der
        // öffentlichen Anzeigen - ein wiederholter Rechenlauf ohne Änderung bleibt still.
        if (outcome.resultsWritten || splitsChanged) {
            EventChangeMarker.bump(eventId)
        }

        // Antwort mit dem frischen Stand NACH der Übernahme, in derselben stabilen Reihenfolge.
        val computedTeams = classified.filter { it.third == null }.map { it.first }
        val computed = !officialTimeDtos(eventId, computedTeams, markTimes)
        KIO.ok(ApiResponse.Dto(OfficialTimeComputeResultDto(computed = computed, skipped = skipped)))
    }

    /**
     * Every official time of the event, plus a placeholder row for each team that has marks but no
     * official time yet - so the Leitstand's result table lists the teams a recompute would touch
     * instead of hiding them until the first compute ran.
     */
    fun getForEvent(
        eventId: UUID,
    ): App<ServiceError, ApiResponse.ListDto<OfficialTimeDto>> = KIO.comprehension {
        val markTimes = !resolveMarkTimes(eventId)
        val records = !TimingOfficialTimeRepo.getByEvent(eventId).orDie()

        val persistedTeams = records.map { it.competitionMatchTeam }.toSet()
        val unpersistedTeams = markTimes.keys.filter { !persistedTeams.contains(it) }
        // Der Platz kommt vom Team, nicht aus der Zeile - einmal gesammelt für alle Zeilen.
        val placeByTeam = !teamPlaces(persistedTeams + unpersistedTeams)

        val persisted = records.map { record ->
            val times = markTimes[record.competitionMatchTeam]
            officialTimeDto(record, times?.startMillis, times?.finishMillis, placeByTeam[record.competitionMatchTeam])
        }
        val unpersisted = unpersistedTeams.map { teamId ->
            val times = markTimes[teamId]
            unpersistedOfficialTimeDto(teamId, eventId, times?.startMillis, times?.finishMillis, placeByTeam[teamId])
        }

        KIO.ok(
            ApiResponse.ListDto(
                (persisted + unpersisted).sortedWith(
                    compareBy(
                        { it.effectiveMillis ?: Long.MAX_VALUE },
                        { it.finishMillis ?: Long.MAX_VALUE },
                        { it.competitionMatchTeam },
                    )
                )
            )
        )
    }

    /**
     * Replaces the manual part of a team's official time (see [OfficialTimeOverrideRequest] for the
     * PUT semantics) and creates the row when the team does not have one yet - an official time set
     * purely by hand, for a team whose marks are missing entirely, is a legitimate result.
     *
     * Die Änderung wird im selben Aufruf zurückgeschrieben (Strafe samt Grund landet als
     * `penalty_seconds`/`penalty_note` am Team); ob wirklich geschrieben wird, entscheidet wie
     * überall [TimingApplyLogic].
     */
    fun setOverride(
        eventId: UUID,
        teamId: UUID,
        request: OfficialTimeOverrideRequest,
        userId: UUID,
    ): App<ServiceError, ApiResponse.NoData> = KIO.comprehension {
        !checkTeamOfEvent(teamId, eventId)

        !upsert(eventId, teamId, userId, LocalDateTime.now()) {
            overrideMillis = request.overrideMillis
            penaltyMillis = request.penaltyMillis ?: 0L
            penaltyNote = request.penaltyNote?.trim()?.takeIf { it.isNotEmpty() }
            resultStatus = (request.resultStatus ?: OfficialTimeResultStatus.NONE).name
        }

        val written = !recomputeApplyAndBroadcast(eventId, listOf(teamId), userId)
        // Nur wenn die Übernahme wirklich an den Lauf geschrieben hat, erfahren die öffentlichen
        // Anzeigen davon - eine wiederholte identische Eingabe (oder Schalter aus) bleibt still.
        if (written) {
            EventChangeMarker.bump(eventId)
        }
        noData
    }

    /**
     * Copies the effective official times of [PushOfficialTimesRequest.teams] into the results flow
     * - der manuelle Weg neben der Echtzeit-Übernahme: nötig bei ausgeschaltetem Schalter und der
     * einzige, der eine eingefrorene Zeile (`force`) überschreiben darf.
     *
     * The write mirrors `CompetitionExecutionService.updateMatchResult(-ByFile)` exactly - same
     * `timecode` id (the match team's own id), same fields (see [officialTimecode]), and the same
     * `failed`/`failed_reason` representation for non-finishers - so referee approval keeps working
     * on pushed times as if they had been imported.
     *
     * Wie die Echtzeit-Übernahme schreibt auch der Push die PLÄTZE des betroffenen Laufs mit: die
     * gepushten Teams bekommen ihren aus den Zeiten abgeleiteten Platz, und eigene, früher
     * geschriebene Ergebnisse desselben Laufs rücken nach (nur der Platz - ihre Zeit bleibt, auch
     * bei ausgeschaltetem Schalter, denn der Push ist eine ausdrückliche Handlung genau für die
     * ausgewählten Teams). Fremde Plätze bleiben unberührt.
     *
     * All or nothing: a single conflicting team fails the whole call (and rolls the transaction
     * back) with the per-team reasons attached, so an operator never ends up with half a round
     * pushed. [PushOfficialTimesRequest.force] overrides the freeze boundary only - ein erzwungener
     * Push macht den Stand des Teams wieder zu unserem (Fingerabdruck) und vergibt den Platz neu
     * aus den Zeiten.
     */
    fun pushOfficialTimes(
        eventId: UUID,
        request: PushOfficialTimesRequest,
        userId: UUID,
    ): App<ServiceError, ApiResponse.NoData> = KIO.comprehension {
        val pushables = !request.teams.traverse { teamId ->
            KIO.comprehension {
                val team = !checkTeamOfEvent(teamId, eventId)
                val official = !TimingOfficialTimeRepo.getByTeam(teamId).orDie()
                    .onNullFail { TimingError.OfficialTimeNotFound }
                KIO.ok(team to official)
            }
        }

        val conflicts = !pushables.traverse { (team, official) ->
            KIO.comprehension {
                val status = OfficialTimeResultStatus.valueOf(official.resultStatus!!)
                val frozen = !isFrozen(team, official)
                KIO.ok(
                    when {
                        frozen && !request.force ->
                            OfficialTimePushConflictDto(team.id, PushConflictReason.RESULT_FROZEN)

                        status == OfficialTimeResultStatus.NONE && effectiveMillis(official) == null ->
                            OfficialTimePushConflictDto(team.id, PushConflictReason.NO_EFFECTIVE_TIME)

                        else -> null
                    }
                )
            }
        }.map { it.filterNotNull() }
        !KIO.failOn(conflicts.isNotEmpty()) { TimingError.PushConflict(conflicts) }

        val now = LocalDateTime.now()
        val precision = (!eventSettings(eventId)).precision
        val changed = !pushables
            .groupBy { (team) -> team.competitionMatch!! }
            .entries.toList()
            .traverse { (matchId, pushablesOfMatch) ->
                pushMatch(matchId, pushablesOfMatch.map { it.first.id!! }.toSet(), precision, userId, now)
            }.map { it.flatten() }

        // A push is a manual write on the same fields the RaceClocker poll job writes, so it pauses
        // a configured auto-pull like every other manual path (mask, file upload) - otherwise the
        // next poll tick would overwrite the pushed result. No-op without RaceClocker on the match.
        !pushables.map { (team) -> team.competitionMatch!! }.distinct().traverse { matchId ->
            CompetitionExecutionService.pauseRaceClockerAutoPull(matchId)
        }

        // Jede Zeile in `changed` steht für ein tatsächlich beschriebenes Team (Push oder
        // nachgerückter Platz) - die öffentlichen Anzeigen laden auf den einen Bump hin sofort
        // nach. Der Konflikt-Riegel oben garantiert, dass ein Push nie leer durchläuft; ein
        // theoretisch leeres `changed` bliebe trotzdem korrekt still.
        if (changed.isNotEmpty()) {
            EventChangeMarker.bump(eventId)
        }

        val markTimes = !resolveMarkTimes(eventId)
        broadcastAsync(eventId, !officialTimeDtos(eventId, changed, markTimes))
        noData
    }

    /**
     * Der Push für einen Lauf: Zukunftsbild bilden (gepushte Teams mit ihrem Ziel-Stand, alle
     * anderen mit dem Stand am Boot), Plätze ableiten, dann schreiben - die gepushten Teams
     * vollständig, eigene übrige Ergebnisse nur im Platz. Der Konflikt-Riegel ist zu diesem
     * Zeitpunkt bereits passiert, deshalb schreiben die gepushten Teams ohne weitere Entscheidung.
     */
    private fun pushMatch(
        matchId: UUID,
        pushTeams: Set<UUID>,
        precision: TimingPrecision,
        userId: UUID,
        now: LocalDateTime,
    ): App<Nothing, List<UUID>> = KIO.comprehension {
        val teams = !CompetitionMatchTeamRepo.getByMatch(matchId).orDie()
        val ids = teams.mapNotNull { it.id }
        val officials = (!TimingOfficialTimeRepo.getByTeams(ids).orDie())
            .associateBy { it.competitionMatchTeam }
        val teamStates = !teams.traverse { team ->
            resolveTeamState(team).map { state -> team.id!! to state }
        }.map { it.toMap() }

        val places = deriveMatchPlaces(teams, officials, teamStates) { team, official, teamState ->
            if (team.id in pushTeams) targetState(official!!, precision) else teamState
        }

        val changed = !teams.traverse { team ->
            KIO.comprehension {
                val teamId = team.id!!
                val official = officials[teamId] ?: return@comprehension KIO.ok(null)
                val teamState = teamStates[teamId]!!
                var changedTeam: UUID? = null

                if (teamId in pushTeams) {
                    val base = targetState(official, precision)
                    val target = base.copy(place = places[teamId], placesCalculated = base.hasResult)
                    !writeResult(team, target, precision, userId, now)
                    !updateExisting(teamId, userId, now) {
                        pushedAt = now
                        dirty = false
                        // Auch der manuelle Weg hinterlässt den Fingerabdruck: ab jetzt ist der
                        // Stand am Team "unserer", und die Echtzeit-Übernahme darf ihn weiterpflegen.
                        appliedFingerprint = TimingApplyLogic.fingerprint(target)
                    }
                    changedTeam = teamId
                } else {
                    val own = official.appliedFingerprint != null &&
                        fingerprintOrNull(teamState) == official.appliedFingerprint
                    val newPlace = places[teamId]
                    if (own && teamState.hasResult && newPlace != teamState.place) {
                        // Nur der Platz rückt nach - Zeit, Status und Strafe des früher
                        // geschriebenen Ergebnisses bleiben unangetastet.
                        val target = teamState.copy(place = newPlace, placesCalculated = true)
                        !CompetitionMatchTeamRepo.updateById(teamId) {
                            place = target.place
                            placesCalculated = target.placesCalculated
                            updatedBy = userId
                            updatedAt = now
                        }.orDie()
                        !updateExisting(teamId, userId, now) {
                            appliedFingerprint = TimingApplyLogic.fingerprint(target)
                        }
                        changedTeam = teamId
                    }
                }
                KIO.ok(changedTeam)
            }
        }.map { it.filterNotNull() }

        KIO.ok(changed)
    }

    /**
     * The explicit "Zeiten löschen" action: physically removes RETRACTED marks of the event, or of
     * [stationId] alone.
     *
     * This is the only path that ever deletes a time mark (core principle: no timestamp is lost by
     * accident). ACTIVE marks are never touched, whatever is requested - retracting a mark first is
     * the deliberate step that makes it deletable.
     */
    fun deleteRetractedMarks(
        eventId: UUID,
        stationId: UUID?,
    ): App<ServiceError, ApiResponse.Dto<DeletedTimeMarksDto>> = KIO.comprehension {
        if (stationId != null) {
            val station = !TimingStationRepo.get(stationId).orDie().onNullFail { TimingError.StationNotFound }
            !KIO.failOn(station.event != eventId) { TimingError.EventMismatch }
        }

        val ids = !TimingTimeMarkRepo.getRetractedIds(eventId, stationId).orDie()
        if (ids.isNotEmpty()) {
            !TimingTimeMarkRepo.deleteByIds(ids).orDie()
            broadcastDeletedAsync(eventId, ids)
        }
        KIO.ok(ApiResponse.Dto(DeletedTimeMarksDto(ids)))
    }

    // ------------------------------------------------------------------ Schreib-/Lesehelfer

    /**
     * Der Ergebnisstand, den eine Übernahme dieser Zeile an das Team schreiben würde - noch OHNE
     * Platz; den leitet der Lauf-Zuschnitt ab ([applyMatch]/[pushMatch]) und setzt ihn per `copy`.
     *
     * Die Zeit ist hier bereits auf die eingestellte Genauigkeit ABGESCHNITTEN (Strafe vorher in
     * der Summe, siehe [effectiveMillis] -> [TimingPrecisionLogic]) - damit trägt auch der
     * Fingerabdruck den abgeschnittenen Wert. Nur so erkennt die Übernahme nach einer
     * Genauigkeits-Änderung ihre eigenen Zeilen wieder: der alte Abdruck stimmt mit dem alten
     * Team-Stand überein, und die Umrechnung auf die neue Stufe ist ein gewöhnliches WriteResult
     * statt eines vermeintlich fremden Eingriffs.
     */
    private fun targetState(
        official: TimingOfficialTimeRecord,
        precision: TimingPrecision,
    ): TimingApplyLogic.ResultState {
        val status = OfficialTimeResultStatus.valueOf(official.resultStatus!!)
        return TimingApplyLogic.ResultState(
            timeMillis = effectiveMillis(official)?.let { TimingPrecisionLogic.truncate(it, precision) },
            statusText = status.takeIf { it != OfficialTimeResultStatus.NONE }?.name,
            penaltySeconds = TimingApplyLogic.penaltySecondsFor(official.penaltyMillis),
            penaltyNote = official.penaltyNote?.trim()?.takeIf { it.isNotEmpty() },
        )
    }

    /** Der Ergebnisstand, der aktuell am Team steht (Timecode, failed, Strafspalten, Platz). */
    private fun resolveTeamState(
        team: CompetitionMatchTeamRecord,
    ): App<Nothing, TimingApplyLogic.ResultState> = KIO.comprehension {
        val timecodeMillis = team.timecode?.let { id -> (!TimecodeRepo.get(id).orDie())?.time }
        KIO.ok(
            TimingApplyLogic.ResultState(
                timeMillis = timecodeMillis,
                statusText = if (team.failed == true) (team.failedReason ?: "") else null,
                penaltySeconds = team.penaltySeconds,
                penaltyNote = team.penaltyNote,
                place = team.place,
                placesCalculated = team.placesCalculated ?: false,
            )
        )
    }

    /**
     * Writes one team's result exactly the way the import path does.
     *
     * The `timecode` row reuses the match team's own id (that is how the results flow links the two,
     * and how it deletes a previous time), so the delete-then-insert below is also what makes a
     * re-push idempotent. A team with a DNS/DNF/DSQ status gets no timecode at all and is flagged
     * `failed` with the status as reason - the same shape the import produces for a time cell that
     * holds a no-result status instead of a time.
     *
     * Es wird exakt der übergebene [target]-Stand geschrieben - derselbe, aus dem der Fingerabdruck
     * entsteht; Schreiben und Wiedererkennen können so nicht auseinanderlaufen. Die geschriebene
     * Zeit enthält die Strafe bereits (Konvention seit V202608061202); `penalty_seconds` und
     * `penalty_note` sind die Anzeige-Spalten, über die Schiedsrichter und Ergebnislisten sehen,
     * warum eine Zeit abweicht. Der Platz kommt aus der Ableitung des Lauf-Zuschnitts und wird -
     * wie beim Import - mit `places_calculated = true` gekennzeichnet: er wurde aus den Zeiten
     * berechnet, nicht eingegeben.
     *
     * [precision] bestimmt die Stellenzahl des gerenderten Timecodes - der Aufrufer hat [target]
     * bereits auf genau diese Stufe abgeschnitten.
     */
    private fun writeResult(
        team: CompetitionMatchTeamRecord,
        target: TimingApplyLogic.ResultState,
        precision: TimingPrecision,
        userId: UUID?,
        now: LocalDateTime,
    ): App<Nothing, Unit> = KIO.comprehension {
        !TimecodeRepo.delete(team.id).orDie()
        val timecodeId = if (target.statusText == null) {
            // `target.timeMillis` ist bereits abgeschnitten; die Timecode-Präzision folgt der
            // Stufe, damit am Lauf "1:31.5" gerendert wird und nicht "1:31.500".
            !TimecodeRepo.create(officialTimecode(target.timeMillis!!, precision).toRecord(team.id)).orDie()
        } else {
            null
        }

        !CompetitionMatchTeamRepo.updateById(team.id) {
            timecode = timecodeId
            failed = target.statusText != null
            failedReason = target.statusText
            penaltySeconds = target.penaltySeconds
            penaltyNote = target.penaltyNote
            place = target.place
            placesCalculated = target.placesCalculated
            updatedBy = userId
            updatedAt = now
        }.orDie()

        KIO.ok(Unit)
    }

    /**
     * Das Gegenstück zu [writeResult]: entfernt unser eigenes Ergebnis wieder vom Team, wenn seine
     * Grundlage weg ist (Rücknahme, Umhängen) - einschließlich des von uns abgeleiteten Platzes;
     * die übrigen Boote des Laufs rücken im selben Zug auf ([applyMatch]). `finished_at` und alles
     * Weitere der Rennlogik bleiben unberührt, ein Lauf wird hierdurch weder beendet noch wieder
     * geöffnet.
     */
    private fun clearResult(
        team: CompetitionMatchTeamRecord,
        userId: UUID?,
        now: LocalDateTime,
    ): App<Nothing, Unit> = KIO.comprehension {
        !TimecodeRepo.delete(team.id).orDie()
        !CompetitionMatchTeamRepo.updateById(team.id) {
            timecode = null
            failed = false
            failedReason = null
            penaltySeconds = null
            penaltyNote = null
            place = null
            placesCalculated = false
            updatedBy = userId
            updatedAt = now
        }.orDie()
        KIO.ok(Unit)
    }

    /**
     * Whether a team's result is already recorded in the results flow BY SOMEONE ELSE, and
     * therefore frozen.
     *
     * The results flow has no dedicated approval flag: recording a result IS
     * `updateMatchResult(-ByFile)` writing `place` / `places_calculated` on the match team (and the
     * round moving on afterwards, which `checkUpdateMatchResult` then locks). `failed` is the same
     * kind of marker for a non-finisher.
     *
     * Seit die Zeitnahme selbst Plätze schreibt, ist die Grenze nicht mehr "Platz gesetzt",
     * sondern "FREMDER Platz gesetzt": Stimmt der Stand am Team - Platz eingeschlossen - mit dem
     * eigenen Fingerabdruck überein, friert nichts ein; sonst hat ihn jemand anderes angefasst
     * (Schiedsrichter-Maske, Import, Handkorrektur) und er bleibt eingefroren wie eh und je.
     * Bestandsdaten aus der Zeit vor dem Platz-Umbau tragen per Migration V202608211460 den
     * Abdruck "ohne eigenen Platz" - ein damals vom Schiedsrichter berechneter Platz gilt damit
     * weiterhin als fremd.
     */
    private fun isFrozen(
        team: CompetitionMatchTeamRecord,
        official: TimingOfficialTimeRecord,
    ): App<Nothing, Boolean> = KIO.comprehension {
        val teamState = !resolveTeamState(team)
        val teamFingerprint = fingerprintOrNull(teamState)
        // Exakt unser eigener Stand friert nie ein.
        if (teamFingerprint != null && teamFingerprint == official.appliedFingerprint) {
            return@comprehension KIO.ok(false)
        }

        // Ein Platz am Team friert nur ein, wenn er FREMD ist - also nicht dem Platz entspricht,
        // den unser eigener Abdruck festhält. So bleibt der Push die Quelle der Wahrheit für
        // bloße Randkorrekturen (z. B. eine von Hand nachgetragene Strafspalte), ohne je einen
        // fremd vergebenen Platz zu überschreiben.
        val applied = official.appliedFingerprint?.let { TimingApplyLogic.parseFingerprint(it) }
        val placeRecorded = team.place != null || team.placesCalculated == true
        val placeIsOurs = applied != null && team.place == applied.place &&
            (team.placesCalculated ?: false) == applied.placesCalculated
        if (placeRecorded && !placeIsOurs) return@comprehension KIO.ok(true)

        // Fremdes `failed` (Schiedsrichter-Ausscheidung) friert weiterhin ein; das eigene nicht,
        // sonst könnte nach einem eigenen DNS/DNF/DSQ nie wieder übernommen werden.
        KIO.ok(team.failed == true && teamFingerprint != official.appliedFingerprint)
    }

    private fun checkTeamOfEvent(
        teamId: UUID,
        eventId: UUID,
    ): App<TimingError, CompetitionMatchTeamRecord> = KIO.comprehension {
        val team = !CompetitionMatchTeamRepo.getById(teamId).orDie().onNullFail { TimingError.TeamNotFound }
        val teamEvent = !CompetitionMatchTeamRepo.getEventId(teamId).orDie()
            .onNullFail { TimingError.TeamNotFound }
        !KIO.failOn(teamEvent != eventId) { TimingError.EventMismatch }
        KIO.ok(team)
    }

    /**
     * Updates the official time of [teamId], inserting the row first if it does not exist yet.
     *
     * [f] runs on the record either way, so callers describe the change once instead of duplicating
     * it for the insert and the update case.
     *
     * Race-safe by construction rather than by locking: [TimingOfficialTimeRepo.createIfAbsent]
     * turns a losing concurrent insert (two overlapping computes, or a compute racing a manual
     * override for the same team) into a no-op instead of a unique-constraint violation, and the
     * loser then falls back to the same update path the "already existing" branch uses - so its
     * change still lands instead of a 500.
     */
    private fun upsert(
        eventId: UUID,
        teamId: UUID,
        userId: UUID?,
        now: LocalDateTime,
        f: TimingOfficialTimeRecord.() -> Unit,
    ): App<Nothing, TimingOfficialTimeRecord> = KIO.comprehension {
        val existing = !TimingOfficialTimeRepo.getByTeam(teamId).orDie()
        if (existing != null) {
            val updated = !updateExisting(teamId, userId, now, f)
            KIO.ok(updated ?: existing)
        } else {
            val record = TimingOfficialTimeRecord(
                id = UUID.randomUUID(),
                competitionMatchTeam = teamId,
                event = eventId,
                computedMillis = null,
                overrideMillis = null,
                penaltyMillis = 0L,
                penaltyNote = null,
                resultStatus = OfficialTimeResultStatus.NONE.name,
                dirty = false,
                pushedAt = null,
                appliedFingerprint = null,
                createdAt = now,
                createdBy = userId,
                updatedAt = now,
                updatedBy = userId,
            ).apply(f)
            val inserted = !TimingOfficialTimeRepo.createIfAbsent(record).orDie()
            if (inserted > 0) {
                KIO.ok(record)
            } else {
                // Lost the race: another call inserted the row between our read and our insert.
                // Fall back to updating it instead of dropping this call's change.
                val updated = !updateExisting(teamId, userId, now, f)
                KIO.ok(updated ?: record)
            }
        }
    }

    private fun updateExisting(
        teamId: UUID,
        userId: UUID?,
        now: LocalDateTime,
        f: TimingOfficialTimeRecord.() -> Unit,
    ): App<Nothing, TimingOfficialTimeRecord?> = TimingOfficialTimeRepo.update(teamId) {
        f()
        updatedAt = now
        updatedBy = userId
    }.orDie()

    /** Why [times] cannot produce a computed official time, or null when they can. */
    private fun skipReason(times: TeamMarkTimes): OfficialTimeSkipReason? = when {
        times.finishMillis == null -> OfficialTimeSkipReason.NO_FINISH_MARK
        times.startMillis == null -> OfficialTimeSkipReason.NO_START_MARK
        times.finishMillis < times.startMillis -> OfficialTimeSkipReason.NEGATIVE_DURATION
        else -> null
    }

    /**
     * Start and finish instant per team, from the event's assigned ACTIVE marks.
     *
     * A team that was restarted carries more than one start mark; the latest one is the start it
     * actually took. A double-tapped finish is the mirror image: the earliest crossing is the real
     * one. Marks on SPLIT stations are intermediate and never part of the official time.
     */
    private fun resolveMarkTimes(eventId: UUID): App<Nothing, Map<UUID, TeamMarkTimes>> = KIO.comprehension {
        val marks = !TimingOfficialTimeRepo.getAssignedActiveMarks(eventId).orDie()
        KIO.ok(
            marks.groupBy { it.competitionMatchTeam }.mapValues { (_, teamMarks) ->
                TeamMarkTimes(
                    startMillis = teamMarks.filter { it.stationType == TimingStationType.START }
                        .maxOfOrNull { it.timestampMillis },
                    finishMillis = teamMarks.filter { it.stationType == TimingStationType.FINISH }
                        .minOfOrNull { it.timestampMillis },
                )
            }
        )
    }

    /**
     * Die frischen Zeilen von [teamIds] als DTOs, samt Marken-Zeiten und dem Platz, wie er nach
     * dem Schreiben am Team steht - eine Sammelabfrage je Aufruf statt einer je Team.
     */
    private fun officialTimeDtos(
        eventId: UUID,
        teamIds: Collection<UUID>,
        markTimes: Map<UUID, TeamMarkTimes>,
    ): App<Nothing, List<OfficialTimeDto>> = KIO.comprehension {
        val distinct = teamIds.distinct()
        if (distinct.isEmpty()) return@comprehension KIO.ok(emptyList())
        val placeByTeam = !teamPlaces(distinct)
        val records = !TimingOfficialTimeRepo.getByTeams(distinct).orDie()
        val byTeam = records.associateBy { it.competitionMatchTeam }
        KIO.ok(
            distinct.mapNotNull { teamId ->
                val times = markTimes[teamId]
                byTeam[teamId]?.let { record ->
                    officialTimeDto(record, times?.startMillis, times?.finishMillis, placeByTeam[teamId])
                }
                // Marken ohne persistierte Zeile (z.B. Zielzeit ohne Start): derselbe Platzhalter
                // wie in getForEvent, damit der Grund der fehlenden Zeit sofort sichtbar wird
                // statt erst beim nächsten Neuladen. Ohne Marken UND ohne Zeile bleibt das Team
                // stumm - sonst bekäme jedes Boot, das noch nicht dran war, eine Rausch-Nachricht.
                    ?: times?.let {
                        unpersistedOfficialTimeDto(teamId, eventId, it.startMillis, it.finishMillis, placeByTeam[teamId])
                    }
            }
        )
    }

    /** Der aktuelle Platz je Team - für die Anzeige der Zeilen im Leitstand. */
    private fun teamPlaces(teamIds: Collection<UUID>): App<Nothing, Map<UUID, Int?>> =
        CompetitionMatchTeamRepo.getByIds(teamIds.distinct()).orDie()
            .map { teams -> teams.associate { it.id!! to it.place } }

    // Mirrors TimingService.broadcastAsync: mutations run inside respondKIO's transaction, so the
    // broadcast must wait for its commit - AfterCommit buffers it there (and runs it immediately for
    // non-HTTP callers).
    private fun broadcastAsync(eventId: UUID, officialTimes: List<OfficialTimeDto>) {
        if (officialTimes.isEmpty()) return
        AfterCommit.register {
            TimingBroadcaster.broadcast(eventId, TimingWsMessage.OfficialTimeChanged(officialTimes))
        }
    }

    private fun broadcastDeletedAsync(eventId: UUID, timeMarkIds: List<UUID>) {
        AfterCommit.register {
            TimingBroadcaster.broadcast(eventId, TimingWsMessage.TimesDeleted(timeMarkIds))
        }
    }
}
