package de.lambda9.ready2race.backend.app.timing.boundary

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.ServiceError
import de.lambda9.ready2race.backend.app.competitionExecution.control.CompetitionMatchTeamRepo
import de.lambda9.ready2race.backend.app.timecode.control.TimecodeRepo
import de.lambda9.ready2race.backend.app.timecode.control.toRecord
import de.lambda9.ready2race.backend.app.timing.control.*
import de.lambda9.ready2race.backend.app.timing.entity.*
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
 * `competition_match_team` (computed, or manually overridden, plus penalties and DNS/DNF/DSQ) and -
 * only on an explicit push - copies that time into the existing `timecode` results flow.
 *
 * The copy is deliberately a snapshot, not a live link. Once a result is recorded in the results
 * flow, later timing edits never propagate on their own; they only flag the official time
 * [TimingOfficialTimeRecord.dirty] so the Leitstand can show that a re-push may be needed.
 */
object TimingOfficialTimeService {

    /** Start and finish instant a computation would use for one team. */
    private data class TeamMarkTimes(
        val startMillis: Long?,
        val finishMillis: Long?,
    )

    /**
     * Recomputes `finish - start` for [teams] (all teams of the event when null) and upserts the
     * result.
     *
     * Only assigned, ACTIVE marks count. Everything the computation cannot form a time from is
     * reported back with a reason instead of being silently ignored, and existing rows keep their
     * override, penalty and status - a recompute refreshes the machine-derived part only, and clears
     * the dirty flag for the teams it recomputed.
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

        val now = LocalDateTime.now()
        val computed = !classified.filter { it.third == null }.traverse { (teamId, times, _) ->
            KIO.comprehension {
                val record = !upsert(eventId, teamId, userId, now) {
                    computedMillis = times.finishMillis!! - times.startMillis!!
                    dirty = false
                }
                KIO.ok(officialTimeDto(record, times.startMillis, times.finishMillis))
            }
        }
        if (computed.isNotEmpty()) {
            broadcastAsync(eventId, computed)
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
     * A row that was already pushed becomes dirty: the results flow still holds the previously
     * pushed value, and the Leitstand has to show that the two now disagree.
     */
    fun setOverride(
        eventId: UUID,
        teamId: UUID,
        request: OfficialTimeOverrideRequest,
        userId: UUID,
    ): App<ServiceError, ApiResponse.NoData> = KIO.comprehension {
        !checkTeamOfEvent(teamId, eventId)

        val record = !upsert(eventId, teamId, userId, LocalDateTime.now()) {
            overrideMillis = request.overrideMillis
            penaltyMillis = request.penaltyMillis ?: 0L
            resultStatus = (request.resultStatus ?: OfficialTimeResultStatus.NONE).name
            if (pushedAt != null) dirty = true
        }

        val times = (!resolveMarkTimes(eventId))[teamId]
        broadcastAsync(eventId, listOf(officialTimeDto(record, times?.startMillis, times?.finishMillis)))
        noData
    }

    /**
     * Copies the effective official times of [PushOfficialTimesRequest.teams] into the results flow.
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

        val conflicts = pushables.mapNotNull { (team, official) ->
            val status = OfficialTimeResultStatus.valueOf(official.resultStatus!!)
            when {
                isFrozen(team) && !request.force ->
                    OfficialTimePushConflictDto(team.id, PushConflictReason.RESULT_FROZEN)

                status == OfficialTimeResultStatus.NONE && effectiveMillis(official) == null ->
                    OfficialTimePushConflictDto(team.id, PushConflictReason.NO_EFFECTIVE_TIME)

                else -> null
            }
        }
        !KIO.failOn(conflicts.isNotEmpty()) { TimingError.PushConflict(conflicts) }

        val now = LocalDateTime.now()
        val pushed = !pushables.traverse { (team, official) ->
            KIO.comprehension {
                !writeResult(team, official, userId, now)
                val updated = !TimingOfficialTimeRepo.update(team.id) {
                    pushedAt = now
                    dirty = false
                    updatedAt = now
                    updatedBy = userId
                }.orDie().onNullFail { TimingError.OfficialTimeNotFound }
                KIO.ok(updated)
            }
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

    /**
     * Flags the official times of [teamIds] as out of date and tells the Leitstand about it.
     *
     * Called from every timing mutation that can change what a team's time would compute to
     * (retract, (re)assign). Teams without an official time are a no-op, which is why this is safe
     * to call unconditionally from the hot path.
     */
    fun markTeamsDirty(
        eventId: UUID,
        teamIds: List<UUID>,
        userId: UUID,
    ): App<Nothing, Unit> = KIO.comprehension {
        val distinct = teamIds.distinct()
        if (distinct.isEmpty()) return@comprehension KIO.ok(Unit)

        val flagged = !TimingOfficialTimeRepo.markDirty(distinct, userId).orDie()
        if (flagged > 0) {
            val records = !TimingOfficialTimeRepo.getByTeams(distinct).orDie()
            val markTimes = !resolveMarkTimes(eventId)
            broadcastAsync(
                eventId,
                records.map { record ->
                    val times = markTimes[record.competitionMatchTeam]
                    officialTimeDto(record, times?.startMillis, times?.finishMillis)
                },
            )
        }
        KIO.ok(Unit)
    }

    /**
     * Writes one team's result exactly the way the import path does.
     *
     * The `timecode` row reuses the match team's own id (that is how the results flow links the two,
     * and how it deletes a previous time), so the delete-then-insert below is also what makes a
     * re-push idempotent. A team with a DNS/DNF/DSQ status gets no timecode at all and is flagged
     * `failed` with the status as reason - the same shape the import produces for a time cell that
     * holds a no-result status instead of a time.
     */
    private fun writeResult(
        team: CompetitionMatchTeamRecord,
        official: TimingOfficialTimeRecord,
        userId: UUID,
        now: LocalDateTime,
    ): App<Nothing, Unit> = KIO.comprehension {
        val status = OfficialTimeResultStatus.valueOf(official.resultStatus!!)

        !TimecodeRepo.delete(team.id).orDie()
        val timecodeId = if (status == OfficialTimeResultStatus.NONE) {
            !TimecodeRepo.create(officialTimecode(effectiveMillis(official)!!).toRecord(team.id)).orDie()
        } else {
            null
        }

        !CompetitionMatchTeamRepo.updateById(team.id) {
            timecode = timecodeId
            failed = status != OfficialTimeResultStatus.NONE
            failedReason = status.name.takeIf { status != OfficialTimeResultStatus.NONE }
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
     * kind of marker for a non-finisher: a referee sets it (with `failedReason`) exactly where a
     * place would otherwise go, so a DNF/DNS/DSQ a referee already recorded is just as much a
     * worked-on result as a calculated place. Any of the three means a referee has already worked
     * with this result, so overwriting its `timecode` snapshot silently would change an approved
     * result - the push refuses unless it is forced.
     */
    private fun isFrozen(team: CompetitionMatchTeamRecord): Boolean =
        team.placesCalculated == true || team.place != null || team.failed == true

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
        userId: UUID,
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
                resultStatus = OfficialTimeResultStatus.NONE.name,
                dirty = false,
                pushedAt = null,
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
        userId: UUID,
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
