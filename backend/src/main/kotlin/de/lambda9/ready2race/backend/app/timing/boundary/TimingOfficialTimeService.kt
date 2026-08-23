package de.lambda9.ready2race.backend.app.timing.boundary

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.ServiceError
import de.lambda9.ready2race.backend.app.competitionExecution.boundary.CompetitionExecutionService
import de.lambda9.ready2race.backend.app.competitionExecution.control.CompetitionMatchTeamRepo
import de.lambda9.ready2race.backend.app.event.control.EventRepo
import de.lambda9.ready2race.backend.app.event.entity.EventError
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
 * Der manuelle [pushOfficialTimes]-Weg bleibt daneben bestehen: er ist der einzige, der eine
 * eingefrorene Zeile (`force`) überschreiben kann, und der Weg für Ereignisse mit ausgeschaltetem
 * Schalter.
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
    )

    // ------------------------------------------------------------------ Echtzeit-Rückschreibung

    /**
     * Herzstück der Echtzeit-Übernahme: berechnet die offiziellen Zeiten von [teamIds] neu und
     * schreibt sie - Schalter und [TimingApplyLogic] erlaubend - sofort an die Läufe zurück.
     *
     * Sendet selbst **keine** Broadcasts: der Startsequenz-Job ruft dies innerhalb der
     * Scheduler-Transaktion auf, wo kein AfterCommit-Puffer installiert ist (siehe [FireResult]).
     * Die geänderten Zeilen kommen deshalb als Rückgabe, und HTTP-Aufrufer nehmen
     * [recomputeApplyAndBroadcast].
     */
    fun recomputeAndApply(
        eventId: UUID,
        teamIds: List<UUID>,
        userId: UUID?,
    ): App<Nothing, List<OfficialTimeDto>> = KIO.comprehension {
        val distinct = teamIds.distinct()
        if (distinct.isEmpty()) return@comprehension KIO.ok(emptyList())

        val markTimes = !resolveMarkTimes(eventId)
        val settings = !eventSettings(eventId)
        val now = LocalDateTime.now()

        val changed = !distinct.traverse { teamId ->
            recomputeAndApplyTeam(eventId, teamId, markTimes[teamId], settings, userId, now)
        }
        KIO.ok(changed.filterNotNull())
    }

    /** [recomputeAndApply] plus Broadcast nach Commit - der Weg für alle HTTP-Mutationen. */
    fun recomputeApplyAndBroadcast(
        eventId: UUID,
        teamIds: List<UUID>,
        userId: UUID?,
    ): App<Nothing, Unit> = KIO.comprehension {
        val changed = !recomputeAndApply(eventId, teamIds, userId)
        broadcastAsync(eventId, changed)
        KIO.ok(Unit)
    }

    /**
     * Neuberechnung + Übernahme für ein Team. Anders als der frühere Rechenknopf räumt die
     * Neuberechnung einen Maschinenwert auch wieder AB, wenn seine Grundlage weg ist (Marke
     * zurückgenommen/umgehängt) - sonst stünde am Lauf eine Zeit, die es nicht mehr gibt.
     *
     * Gibt den FRISCHEN STAND des Teams zurück, sobald es Marken oder eine Zeile hat - auch wenn
     * nichts geschrieben wurde: der Aufruf kommt stets von einer Mutation an genau diesem Team,
     * und Leitstand/Boards brauchen die neuen Start-/Zielwerte live, um den Grund einer (noch)
     * fehlenden Zeit zu zeigen („kein Start", „kein Ziel"). Ohne Zeile kommt derselbe Platzhalter
     * wie in [getForEvent]. Nur ein Team ganz ohne Marken und Zeile meldet nichts (null) - sonst
     * bekäme jedes Boot, das schlicht noch nicht dran war, eine Rausch-Nachricht.
     */
    private fun recomputeAndApplyTeam(
        eventId: UUID,
        teamId: UUID,
        times: TeamMarkTimes?,
        settings: EventTimingSettings,
        userId: UUID?,
        now: LocalDateTime,
    ): App<Nothing, OfficialTimeDto?> = KIO.comprehension {
        val computable = times != null && skipReason(times) == null
        var record = !TimingOfficialTimeRepo.getByTeam(teamId).orDie()
        var recomputeChanged = false

        if (computable) {
            val millis = times!!.finishMillis!! - times.startMillis!!
            if (record == null || record.computedMillis != millis) {
                record = !upsert(eventId, teamId, userId, now) { computedMillis = millis }
                recomputeChanged = true
            }
        } else if (record?.computedMillis != null) {
            record = (!updateExisting(teamId, userId, now) { computedMillis = null }) ?: record
            recomputeChanged = true
        }

        // Kein Rechenergebnis, keine Zeile: nichts zu übernehmen und nichts abzuräumen. Teams MIT
        // Marken melden trotzdem ihren Stand (Platzhalter wie in getForEvent) - Zielzeit ohne
        // Start wäre sonst bis zum nächsten Neuladen unsichtbar.
        val official = record
            ?: return@comprehension KIO.ok(
                times?.let { unpersistedOfficialTimeDto(teamId, eventId, it.startMillis, it.finishMillis) }
            )

        val team = !CompetitionMatchTeamRepo.getById(teamId).orDie()
            ?: return@comprehension KIO.ok(null)
        val applyChanged = !applyToTeam(official, team, settings, userId, now)

        // Auch ohne Schreibvorgang geht der frische Stand zurück (siehe KDoc): nur nach einer
        // Änderung muss die Zeile neu gelesen werden, sonst trägt `official` sie bereits.
        val fresh = if (recomputeChanged || applyChanged) {
            !TimingOfficialTimeRepo.getByTeam(teamId).orDie()
        } else {
            official
        }
        KIO.ok(fresh?.let { officialTimeDto(it, times?.startMillis, times?.finishMillis) })
    }

    /**
     * Der Übernahme-Schritt für eine Zeile: Entscheidung über [TimingApplyLogic], dann derselbe
     * Schreibweg, den auch die manuelle Übernahme nutzt ([writeResult]) - bzw. sein Gegenstück
     * [clearResult], wenn unser eigenes Ergebnis seine Grundlage verloren hat.
     *
     * Gibt zurück, ob sich an Zeile oder Team etwas geändert hat.
     */
    private fun applyToTeam(
        official: TimingOfficialTimeRecord,
        team: CompetitionMatchTeamRecord,
        settings: EventTimingSettings,
        userId: UUID?,
        now: LocalDateTime,
    ): App<Nothing, Boolean> = KIO.comprehension {
        val target = targetState(official, settings.precision)
        val teamState = !resolveTeamState(team)
        val decision = TimingApplyLogic.decide(
            autoApply = settings.autoApply,
            target = target,
            appliedFingerprint = official.appliedFingerprint,
            teamState = teamState,
            teamHasPlace = team.place != null || team.placesCalculated == true,
        )

        when (decision) {
            TimingApplyLogic.Decision.WriteResult -> {
                !writeResult(team, official, settings.precision, userId, now)
                !updateExisting(official.competitionMatchTeam, userId, now) {
                    pushedAt = now
                    dirty = false
                    appliedFingerprint = TimingApplyLogic.fingerprint(target)
                }
                // Dieselbe Regel wie beim manuellen Weg: ein Schreiben auf die Felder, die auch der
                // RaceClocker-Abruf schreibt, pausiert einen konfigurierten Auto-Abruf. No-op ohne
                // RaceClocker am Lauf.
                !CompetitionExecutionService.pauseRaceClockerAutoPull(team.competitionMatch!!)
                KIO.ok(true)
            }

            TimingApplyLogic.Decision.ClearResult -> {
                !clearResult(team, userId, now)
                !updateExisting(official.competitionMatchTeam, userId, now) {
                    pushedAt = null
                    dirty = false
                    appliedFingerprint = null
                }
                !CompetitionExecutionService.pauseRaceClockerAutoPull(team.competitionMatch!!)
                KIO.ok(true)
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
                    KIO.ok(true)
                } else {
                    KIO.ok(false)
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
        KIO.ok(ApiResponse.Dto(TimingSettingsDto(autoApply = settings.autoApply, precision = settings.precision)))
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
     * missdeuten, weil der Fingerabdruck stets den abgeschnittenen Stand trägt.
     */
    fun recomputeApplyEvent(
        eventId: UUID,
        userId: UUID,
    ): App<Nothing, Unit> = KIO.comprehension {
        val markTimes = !resolveMarkTimes(eventId)
        val rows = !TimingOfficialTimeRepo.getByEvent(eventId).orDie()
        val teams = (markTimes.keys + rows.map { it.competitionMatchTeam }).toList()
        !recomputeApplyAndBroadcast(eventId, teams, userId)
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
                TimingWsMessage.SettingsChanged(
                    TimingSettingsDto(autoApply = settings.autoApply, precision = settings.precision)
                ),
            )
        }
        KIO.ok(Unit)
    }

    private fun eventSettings(eventId: UUID): App<Nothing, EventTimingSettings> =
        EventRepo.get(eventId).orDie().map { event ->
            EventTimingSettings(
                autoApply = event?.timingAutoApply ?: true,
                // Spalte ist NOT NULL mit Default; jOOQ typisiert sie dennoch nullable (bekanntes
                // Muster, siehe EventTimingConfigDto) - der Datenbank-Default ist die Rückfalllinie.
                precision = event?.timingPrecision?.let { TimingPrecision.valueOf(it) }
                    ?: TimingPrecision.ZEHNTEL,
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
        val changed = !recomputeAndApply(eventId, affected, userId)
        broadcastAsync(eventId, changed)

        // Antwort mit dem frischen Stand NACH der Übernahme, in derselben stabilen Reihenfolge.
        val computedTeams = classified.filter { it.third == null }.map { it.first }
        val records = (!TimingOfficialTimeRepo.getByTeams(computedTeams).orDie())
            .associateBy { it.competitionMatchTeam }
        val computed = computedTeams.mapNotNull { teamId ->
            records[teamId]?.let { record ->
                val times = markTimes[teamId]
                officialTimeDto(record, times?.startMillis, times?.finishMillis)
            }
        }
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

        val persisted = records.map { record ->
            val times = markTimes[record.competitionMatchTeam]
            officialTimeDto(record, times?.startMillis, times?.finishMillis)
        }
        val persistedTeams = records.map { it.competitionMatchTeam }.toSet()
        val unpersisted = markTimes
            .filterKeys { !persistedTeams.contains(it) }
            .map { (teamId, times) ->
                unpersistedOfficialTimeDto(teamId, eventId, times.startMillis, times.finishMillis)
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

        !recomputeApplyAndBroadcast(eventId, listOf(teamId), userId)
        noData
    }

    /**
     * Copies the effective official times of [PushOfficialTimesRequest.teams] into the results flow
     * - der manuelle Weg neben der Echtzeit-Übernahme: nötig bei ausgeschaltetem Schalter und der
     * einzige, der eine eingefrorene Zeile (`force`) überschreiben darf.
     *
     * The write mirrors `CompetitionExecutionService.updateMatchResult(-ByFile)` exactly - same
     * `timecode` id (the match team's own id), same fields (see [officialTimecode]), and the same
     * `failed`/`failed_reason` representation for non-finishers - so the existing places calculation
     * and referee approval keep working on pushed times as if they had been imported.
     *
     * All or nothing: a single conflicting team fails the whole call (and rolls the transaction
     * back) with the per-team reasons attached, so an operator never ends up with half a round
     * pushed. [PushOfficialTimesRequest.force] overrides the freeze boundary only - it never
     * touches `place` / `places_calculated`. A forced push therefore only replaces the `timecode`
     * snapshot (and `failed`/`failedReason`); the round's places are NOT recalculated, so a referee
     * must re-save the results for this match afterwards for the place to reflect the pushed time.
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
        val pushed = !pushables.traverse { (team, official) ->
            KIO.comprehension {
                !writeResult(team, official, precision, userId, now)
                val updated = !TimingOfficialTimeRepo.update(team.id) {
                    pushedAt = now
                    dirty = false
                    // Auch der manuelle Weg hinterlässt den Fingerabdruck: ab jetzt ist der Stand
                    // am Team "unserer", und die Echtzeit-Übernahme darf ihn weiterpflegen.
                    appliedFingerprint = TimingApplyLogic.fingerprint(targetState(official, precision))
                    updatedAt = now
                    updatedBy = userId
                }.orDie().onNullFail { TimingError.OfficialTimeNotFound }
                KIO.ok(updated)
            }
        }

        // A push is a manual write on the same fields the RaceClocker poll job writes, so it pauses
        // a configured auto-pull like every other manual path (mask, file upload) - otherwise the
        // next poll tick would overwrite the pushed result. No-op without RaceClocker on the match.
        !pushables.map { (team) -> team.competitionMatch!! }.distinct().traverse { matchId ->
            CompetitionExecutionService.pauseRaceClockerAutoPull(matchId)
        }

        val markTimes = !resolveMarkTimes(eventId)
        broadcastAsync(
            eventId,
            pushed.map { record ->
                val times = markTimes[record.competitionMatchTeam]
                officialTimeDto(record, times?.startMillis, times?.finishMillis)
            },
        )
        noData
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
     * Der Ergebnisstand, den eine Übernahme dieser Zeile an das Team schreiben würde.
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

    /** Der Ergebnisstand, der aktuell am Team steht (Timecode, failed, Strafspalten). */
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
     * Es wird exakt der Stand aus [targetState] geschrieben - derselbe, aus dem der Fingerabdruck
     * entsteht; Schreiben und Wiedererkennen können so nicht auseinanderlaufen. Die geschriebene
     * Zeit enthält die Strafe bereits (Konvention seit V202608061202); `penalty_seconds` und
     * `penalty_note` sind die Anzeige-Spalten, über die Schiedsrichter und Ergebnislisten sehen,
     * warum eine Zeit abweicht.
     */
    private fun writeResult(
        team: CompetitionMatchTeamRecord,
        official: TimingOfficialTimeRecord,
        precision: TimingPrecision,
        userId: UUID?,
        now: LocalDateTime,
    ): App<Nothing, Unit> = KIO.comprehension {
        val target = targetState(official, precision)

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
            updatedBy = userId
            updatedAt = now
        }.orDie()

        KIO.ok(Unit)
    }

    /**
     * Das Gegenstück zu [writeResult]: entfernt unser eigenes Ergebnis wieder vom Team, wenn seine
     * Grundlage weg ist (Rücknahme, Umhängen). Fasst ausschließlich die Felder an, die
     * [writeResult] schreibt - Plätze, `finished_at` und alles Weitere der Rennlogik bleiben
     * unberührt, ein Lauf wird hierdurch weder beendet noch wieder geöffnet.
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
            updatedBy = userId
            updatedAt = now
        }.orDie()
        KIO.ok(Unit)
    }

    /**
     * Whether a team's result is already recorded in the results flow, and therefore frozen.
     *
     * The results flow has no dedicated approval flag: recording a result IS
     * `updateMatchResult(-ByFile)` writing `place` / `places_calculated` on the match team (and the
     * round moving on afterwards, which `checkUpdateMatchResult` then locks). `failed` is the same
     * kind of marker for a non-finisher - MIT einer Ausnahme: ein `failed`, das die Zeitnahme
     * selbst geschrieben hat (Team-Stand == [TimingOfficialTimeRecord.appliedFingerprint]), friert
     * nicht ein, sonst könnte nach einem eigenen DNS/DNF/DSQ nie wieder übernommen werden. Ein
     * `failed`, das davon abweicht, hat ein Schiedsrichter gesetzt - das bleibt eingefroren.
     */
    private fun isFrozen(
        team: CompetitionMatchTeamRecord,
        official: TimingOfficialTimeRecord,
    ): App<Nothing, Boolean> = KIO.comprehension {
        if (team.placesCalculated == true || team.place != null) return@comprehension KIO.ok(true)
        if (team.failed != true) return@comprehension KIO.ok(false)
        val teamState = !resolveTeamState(team)
        KIO.ok(TimingApplyLogic.fingerprint(teamState) != official.appliedFingerprint)
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

    /**
     * Start and finish instant per team, from the event's assigned ACTIVE marks.
     *
     * A team that was restarted carries more than one start mark; the latest one is the start it
     * actually took. A double-tapped finish is the mirror image: the earliest crossing is the real
     * one. Marks on SPLIT stations are intermediate and never part of the official time.
     */
    /** Why [times] cannot produce a computed official time, or null when they can. */
    private fun skipReason(times: TeamMarkTimes): OfficialTimeSkipReason? = when {
        times.finishMillis == null -> OfficialTimeSkipReason.NO_FINISH_MARK
        times.startMillis == null -> OfficialTimeSkipReason.NO_START_MARK
        times.finishMillis < times.startMillis -> OfficialTimeSkipReason.NEGATIVE_DURATION
        else -> null
    }

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
