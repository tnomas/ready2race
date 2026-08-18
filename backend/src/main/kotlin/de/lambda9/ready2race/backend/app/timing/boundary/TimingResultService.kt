package de.lambda9.ready2race.backend.app.timing.boundary

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.ServiceError
import de.lambda9.ready2race.backend.app.competitionExecution.boundary.AutoRoundProgressionService
import de.lambda9.ready2race.backend.app.competitionExecution.control.CompetitionMatchTeamRepo
import de.lambda9.ready2race.backend.app.eventInfo.boundary.EventChangeMarker
import de.lambda9.ready2race.backend.app.timecode.control.TimecodeRepo
import de.lambda9.ready2race.backend.app.timecode.control.toRecord
import de.lambda9.ready2race.backend.app.timing.control.AssignedMarkRow
import de.lambda9.ready2race.backend.app.timing.control.TimingResultRepo
import de.lambda9.ready2race.backend.app.timing.control.TimingTeamRepo
import de.lambda9.ready2race.backend.app.timing.control.measuredTimecode
import de.lambda9.ready2race.backend.app.timing.entity.*
import de.lambda9.ready2race.backend.calls.responses.AfterCommit
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.calls.responses.ApiResponse.Companion.noData
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionMatchTeamRecord
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.onNullFail
import de.lambda9.tailwind.core.extensions.kio.orDie
import de.lambda9.tailwind.core.extensions.kio.traverse
import java.time.LocalDateTime
import java.util.UUID

/**
 * The results layer of the Leitstand.
 *
 * Time marks are raw material: this service turns them into one final time per
 * `competition_match_team` - `(finish - start) + penalty` - and, only on an explicit push, copies
 * that time into the existing `timecode` results flow.
 *
 * Two deliberate differences to the pre-port implementation (see the port plan, rules 1 and 2):
 *
 * 1. **Nothing is stored twice.** There is no `timing_official_time` table any more. The measured
 *    part is recomputed from the marks on every read, and the judged part (penalty, DNS/DNF/DSQ)
 *    lives in the columns the whole application already reads
 *    (`penalty_seconds`, `penalty_note`, `failed`, `failed_reason`). A "dirty" flag would have
 *    nothing to guard: the view never shows a stale computation, only the push is a snapshot.
 * 2. **The penalty is computed into the time.** For internal timing the finish mark is a raw
 *    timestamp, so the pushed `timecode` has to carry `measured + penalty` for the base's ubiquitous
 *    "the time already contains the penalty" display to stay truthful. (The RaceClocker path is
 *    untouched - its times already contain their penalties.)
 *
 * The push itself mirrors `CompetitionExecutionService.updateMatchResult` exactly: same `timecode`
 * id (the match team's own id), same delete-then-create, the same `failed`/`failed_reason` shape for
 * non-finishers, the same follow-up ([AutoRoundProgressionService]) and the same cache invalidation
 * ([EventChangeMarker]). It deliberately does NOT write `place`/`places_calculated` - a pushed time
 * is a measurement, and who won is a referee's decision.
 */
object TimingResultService {

    /** Start and finish instant the computation uses for one team. */
    private data class TeamMarkTimes(
        val startMillis: Long?,
        val finishMillis: Long?,
    )

    /**
     * Every team of the event a Leitstand result row exists for: those with assigned marks, plus
     * those that already carry result data (a penalty, a status, or a pushed time) - a DNS boat has
     * no marks at all and would otherwise vanish from the table the moment it is entered.
     *
     * Restricted to the competitions this application actually times (see [resolveRows]): a mixed
     * event is normal, and a RaceClocker boat has no internal measurement to show.
     */
    fun getResults(
        eventId: UUID,
    ): App<ServiceError, ApiResponse.ListDto<TimingResultDto>> = KIO.comprehension {
        val rows = !resolveRows(eventId)
        KIO.ok(
            ApiResponse.ListDto(
                rows.sortedWith(
                    compareBy(
                        { it.computedFinalMillis ?: Long.MAX_VALUE },
                        { it.finishMillis ?: Long.MAX_VALUE },
                        { it.competitionMatchTeam },
                    )
                )
            )
        )
    }

    /**
     * Writes the judged part of one team's result: penalty and DNS/DNF/DSQ.
     *
     * PUT semantics (see [TimingResultEntryRequest]) - the request replaces what is stored, and
     * [TimingResultStatus.NONE] clears `failed`/`failed_reason` again.
     *
     * Setting a status also drops an existing `timecode`: a status supersedes every time, and
     * leaving a previously pushed time next to a fresh DSQ would show a disqualified boat with a
     * result. The penalty on the other hand does NOT touch the timecode - it only becomes part of a
     * time on the next push, which is what makes the push the single moment a measured time enters
     * the results flow.
     *
     * Frozen the same way a push is, but against a narrower boundary: only a recorded PLACE
     * (`place`, or places calculated) blocks the entry, and [TimingResultEntryRequest.force]
     * overrides it. `failed` deliberately does not - whatever set it, and whatever its reason reads
     * like. For an internally timed boat this endpoint IS the referee's status tool, so it must be
     * able to change a DSQ into a DNF or clear it again; a `failed` that blocked the entry would
     * lock the only way back out of a status entered a minute ago.
     *
     * Scoped to READY2RACE the same way [TimingService.assignTimeMark] refuses a mark: a RaceClocker
     * boat has no internal measurement, and this endpoint's `failed`/penalty columns are exactly what
     * that boat's own feed writes - entering a status here would fight the actual timing source.
     */
    fun setResultEntry(
        eventId: UUID,
        teamId: UUID,
        request: TimingResultEntryRequest,
        userId: UUID,
    ): App<ServiceError, ApiResponse.NoData> = KIO.comprehension {
        val team = !checkTeamOfEvent(teamId, eventId)
        val ready2race = !TimingTeamRepo.isReady2RaceTeam(teamId).orDie()
        !KIO.failOn(!ready2race) { TimingError.WrongTimingSystem }

        val status = request.resultStatus ?: TimingResultStatus.NONE
        val now = LocalDateTime.now()

        val placeRecorded = team.placesCalculated == true || team.place != null
        !KIO.failOn(placeRecorded && !request.force) {
            TimingError.PushConflict(listOf(TimingResultPushConflictDto(teamId, PushConflictReason.RESULT_FROZEN)))
        }

        if (status != TimingResultStatus.NONE) {
            !TimecodeRepo.delete(teamId).orDie()
        }

        !CompetitionMatchTeamRepo.updateById(teamId) {
            penaltySeconds = request.penaltySeconds
            penaltyNote = request.penaltyNote
            failed = status != TimingResultStatus.NONE
            failedReason = status.name.takeIf { status != TimingResultStatus.NONE }
            if (status != TimingResultStatus.NONE) {
                timecode = null
            }
            updatedBy = userId
            updatedAt = now
        }.orDie().onNullFail { TimingError.TeamNotFound }

        // Same follow-ups as every other result writer: a status can be the last missing piece of a
        // round, and the entry must not wait out a cache TTL before it shows on the public views.
        !AutoRoundProgressionService.progressAfterMatch(eventId, team.competitionMatch, userId)
        EventChangeMarker.bump(eventId)

        !broadcastTeams(eventId, listOf(teamId))
        noData
    }

    /**
     * Copies the computed results into the results flow.
     *
     * See [PushTimingResultsRequest] for why an explicit team list is stricter than "push
     * everything":
     *
     * - **Explicit list**: a frozen team fails the WHOLE call with a 409, so an operator never ends
     *   up with half a round pushed; [PushTimingResultsRequest.force] overrides that freeze and only
     *   that.
     * - **Push-all** (`teams == null`): a frozen team is left out and reported in `skipped` instead -
     *   the same reason "push everything" already leaves out boats with no final time. A running
     *   regatta always has a few teams somebody already worked with (a DSQ entered, a place typed in
     *   for an earlier heat); refusing the whole batch over one of them would make the button
     *   useless. [PushTimingResultsRequest.force] therefore has no effect on push-all: there is no
     *   conflict there to force past.
     *
     * A forced push replaces the `timecode` snapshot (and `failed`/`failed_reason`) but never
     * recalculates places, so a referee has to re-save the match afterwards for the place to reflect
     * the pushed time.
     */
    fun pushResults(
        eventId: UUID,
        request: PushTimingResultsRequest,
        userId: UUID,
    ): App<ServiceError, ApiResponse.Dto<TimingResultPushResultDto>> = KIO.comprehension {
        val resolved = !resolveRowsWithTeams(eventId)
        val rows = resolved.map { it.dto }
        val teamsById = resolved.associate { it.dto.competitionMatchTeam to it.team }
        val byTeam = rows.associateBy { it.competitionMatchTeam }

        val requested = request.teams
        // An id the caller named explicitly may have no row at all (no marks, no result data). It
        // has to surface as a conflict instead of vanishing from the response without a trace.
        !requested.orEmpty().traverse { teamId -> checkTeamOfEvent(teamId, eventId) }
        // `rows` is already scoped to READY2RACE, so an explicitly named team from a RaceClocker
        // competition would otherwise look like "no final time". It is a different mistake and gets
        // its own reason - and unlike the freeze, `force` never gets past it.
        val ready2race = if (requested == null) {
            emptySet()
        } else {
            !TimingTeamRepo.getReady2RaceTeamIds(eventId, requested).orDie()
        }

        // Push-all drops a frozen-but-pushable row before it ever becomes a candidate - see
        // frozenSkipReason below for where it resurfaces, in `skipped` rather than as a conflict. An
        // explicit list keeps every named row as a candidate, frozen or not, so the freeze still
        // surfaces as a conflict (below) and `force` still gets a chance to override it.
        val candidates = requested?.map { teamId -> teamId to byTeam[teamId] }
            ?: rows.filter { pushable(it) && !it.frozen }.map { it.competitionMatchTeam to it }

        val conflicts = candidates.mapNotNull { (teamId, row) ->
            when {
                requested != null && !ready2race.contains(teamId) ->
                    TimingResultPushConflictDto(teamId, PushConflictReason.WRONG_TIMING_SYSTEM)

                row == null || !pushable(row) ->
                    TimingResultPushConflictDto(teamId, PushConflictReason.NO_FINAL_TIME)

                row.frozen && !request.force ->
                    TimingResultPushConflictDto(teamId, PushConflictReason.RESULT_FROZEN)

                else -> null
            }
        }
        !KIO.failOn(conflicts.isNotEmpty()) { TimingError.PushConflict(conflicts) }

        val pushedRows = candidates.mapNotNull { (_, row) -> row }
        val now = LocalDateTime.now()
        !pushedRows.traverse { row -> writeResult(row, userId, now) }

        // Mirrors updateMatchResult / applyRaceClockerRows: a written result can be the last missing
        // piece of a round. Deliberately per match rather than per competition - a push spans
        // whatever the operator selected, which is usually one heat but need not be.
        !pushedRows.map { it.competitionMatch }.distinct().traverse { matchId ->
            AutoRoundProgressionService.progressAfterMatch(eventId, matchId, userId)
        }
        if (pushedRows.isNotEmpty()) {
            EventChangeMarker.bump(eventId)
        }

        val skipped = if (requested == null) {
            val noFinalTime = rows.filter { !pushable(it) }
                .mapNotNull { row -> row.skipReason?.let { TimingResultSkipDto(row.competitionMatchTeam, it) } }
            val alreadyFrozen = rows.filter { pushable(it) && it.frozen }
                .map { row ->
                    val team = teamsById.getValue(row.competitionMatchTeam)
                    TimingResultSkipDto(row.competitionMatchTeam, frozenSkipReason(team))
                }
            noFinalTime + alreadyFrozen
        } else {
            emptyList()
        }

        // Re-read so the response (and the broadcast) shows the post-push truth - `pushed` in
        // particular is derived from what was just written.
        val after = !resolveRows(eventId)
        val pushedIds = pushedRows.map { it.competitionMatchTeam }.toSet()
        val result = after.filter { pushedIds.contains(it.competitionMatchTeam) }
        broadcastAsync(eventId, result)

        KIO.ok(ApiResponse.Dto(TimingResultPushResultDto(pushed = result, skipped = skipped)))
    }

    /** Whether there is anything to write for this row: a final time, or a status. */
    private fun pushable(row: TimingResultDto): Boolean =
        row.resultStatus != TimingResultStatus.NONE || row.computedFinalMillis != null

    /**
     * Writes one team's result exactly the way the manual entry and the import path do.
     *
     * The `timecode` row reuses the match team's own id - that is how the results flow links the two
     * and how it replaces a previous time - so the delete-then-insert below is also what makes a
     * re-push idempotent. A team with a DNS/DNF/DSQ status gets no timecode at all and is flagged
     * `failed` with the status as reason, the same shape the import produces for a time cell that
     * holds a no-result status instead of a time.
     */
    private fun writeResult(
        row: TimingResultDto,
        userId: UUID,
        now: LocalDateTime,
    ): App<Nothing, Unit> = KIO.comprehension {
        val teamId = row.competitionMatchTeam

        !TimecodeRepo.delete(teamId).orDie()
        val timecodeId = if (row.resultStatus == TimingResultStatus.NONE) {
            !TimecodeRepo.create(measuredTimecode(row.computedFinalMillis!!).toRecord(teamId)).orDie()
        } else {
            null
        }

        !CompetitionMatchTeamRepo.updateById(teamId) {
            timecode = timecodeId
            failed = row.resultStatus != TimingResultStatus.NONE
            failedReason = row.resultStatus.name.takeIf { row.resultStatus != TimingResultStatus.NONE }
            // Written for parity with updateMatchResult even though the values come from these very
            // columns: the push must leave a team in exactly the shape a manual entry would.
            penaltySeconds = row.penaltySeconds
            penaltyNote = row.penaltyNote
            updatedBy = userId
            updatedAt = now
        }.orDie()

        KIO.ok(Unit)
    }

    /** One Leitstand row together with the raw team record it was computed from. */
    private data class ResolvedRow(
        val dto: TimingResultDto,
        val team: CompetitionMatchTeamRecord,
    )

    /**
     * The Leitstand rows of an event, recomputed from the marks and the teams' result columns.
     *
     * Scoped to the teams whose competition's EFFECTIVE timing system (the competition's own choice,
     * else the event's default) is READY2RACE - the mirror image of the filter the RaceClocker poll
     * applies. An event may well run both, and a boat that is timed externally has no internal
     * measurement: showing it here would offer a push that could only overwrite what its own timing
     * source produced.
     */
    private fun resolveRows(eventId: UUID): App<Nothing, List<TimingResultDto>> = KIO.comprehension {
        val resolved = !resolveRowsWithTeams(eventId)
        KIO.ok(resolved.map { it.dto })
    }

    /**
     * Same rows as [resolveRows], paired with the raw team record - [pushResults] needs it to tell
     * apart WHY a push-all row is frozen (a place, versus only a status), which the [TimingResultDto]
     * itself only exposes as one combined [TimingResultDto.frozen] flag.
     */
    private fun resolveRowsWithTeams(eventId: UUID): App<Nothing, List<ResolvedRow>> = KIO.comprehension {
        val marks = !TimingResultRepo.getAssignedActiveMarks(eventId).orDie()
        val markTimes = markTimes(marks)
        val withResultData = !TimingResultRepo.getTeamIdsWithResultData(eventId).orDie()

        val teamIds = (markTimes.keys + withResultData).toList()
        if (teamIds.isEmpty()) return@comprehension KIO.ok(emptyList())

        val ready2race = !TimingTeamRepo.getReady2RaceTeamIds(eventId, teamIds).orDie()
        if (ready2race.isEmpty()) return@comprehension KIO.ok(emptyList())

        val teams = !CompetitionMatchTeamRepo.getByIds(ready2race).orDie()
        KIO.ok(teams.map { team -> ResolvedRow(resultDto(team, eventId, markTimes[team.id]), team) })
    }

    /**
     * Start and finish instant per team, from the event's assigned ACTIVE marks.
     *
     * A team that was restarted carries more than one start mark; the latest one is the start it
     * actually took. A double-tapped finish is the mirror image: the earliest crossing is the real
     * one. Marks on SPLIT stations are intermediate - they become laps (see [TimingLapService]) and
     * never part of the final time.
     */
    private fun markTimes(marks: List<AssignedMarkRow>): Map<UUID, TeamMarkTimes> =
        marks.groupBy { it.competitionMatchTeam }.mapValues { (_, teamMarks) ->
            TeamMarkTimes(
                startMillis = teamMarks.filter { it.stationType == TimingStationType.START }
                    .maxOfOrNull { it.timestampMillis },
                finishMillis = teamMarks.filter { it.stationType == TimingStationType.FINISH }
                    .minOfOrNull { it.timestampMillis },
            )
        }

    private fun resultDto(
        team: CompetitionMatchTeamRecord,
        eventId: UUID,
        times: TeamMarkTimes?,
    ): TimingResultDto {
        val status = if (team.failed == true) {
            TimingResultStatus.fromFailedReason(team.failedReason)
        } else {
            TimingResultStatus.NONE
        }
        val skipReason = skipReason(times)
        val measured = if (skipReason == null) times!!.finishMillis!! - times.startMillis!! else null
        val finalMillis = measured?.plus((team.penaltySeconds ?: 0) * 1_000L)

        return TimingResultDto(
            competitionMatchTeam = team.id,
            event = eventId,
            competitionMatch = team.competitionMatch,
            startMillis = times?.startMillis,
            finishMillis = times?.finishMillis,
            measuredMillis = measured,
            penaltySeconds = team.penaltySeconds,
            penaltyNote = team.penaltyNote,
            resultStatus = status,
            computedFinalMillis = finalMillis.takeIf { status == TimingResultStatus.NONE },
            skipReason = skipReason,
            pushed = team.timecode != null || status != TimingResultStatus.NONE,
            frozen = isFrozen(team),
        )
    }

    /** Why [times] cannot produce a final time, or null when they can. */
    private fun skipReason(times: TeamMarkTimes?): TimingResultSkipReason? = when {
        times == null -> TimingResultSkipReason.NO_MARKS
        times.finishMillis == null -> TimingResultSkipReason.NO_FINISH_MARK
        times.startMillis == null -> TimingResultSkipReason.NO_START_MARK
        times.finishMillis < times.startMillis -> TimingResultSkipReason.NEGATIVE_DURATION
        else -> null
    }

    /**
     * Whether a team's result is already recorded, and a PUSH therefore needs `force`.
     *
     * The results flow has no dedicated approval flag: recording a result IS
     * `updateMatchResult(-ByFile)` writing `place` / `places_calculated`. `failed` is the same kind
     * of marker for a non-finisher - it is set where a place would otherwise go.
     *
     * Plain, with no reading of `failed_reason`. An earlier version exempted a reason that carried
     * one of the status tokens, on the grounds that timing had written it itself - but a
     * `failed_reason` is free text a referee also types, so the exemption made a push's behaviour
     * depend on the wording of somebody's note. It bought nothing either: the ENTRY endpoint
     * ([setResultEntry]) is the sanctioned way to change a status and is deliberately NOT frozen by
     * `failed`, and a push right behind a status entry is a no-op anyway - a status supersedes every
     * time, so there is nothing left for the push to write.
     */
    private fun isFrozen(team: CompetitionMatchTeamRecord): Boolean =
        placeFrozen(team) || team.failed == true

    /** Whether a place is already recorded for this team - the narrower freeze [setResultEntry] uses. */
    private fun placeFrozen(team: CompetitionMatchTeamRecord): Boolean =
        team.placesCalculated == true || team.place != null

    /**
     * Which [TimingResultSkipReason] push-all reports for a row that is [pushable] but [isFrozen] -
     * a place takes priority over a mere status, mirroring the order [isFrozen] itself checks in.
     */
    private fun frozenSkipReason(team: CompetitionMatchTeamRecord): TimingResultSkipReason =
        if (placeFrozen(team)) TimingResultSkipReason.RESULT_FROZEN else TimingResultSkipReason.STATUS_SET

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

    /** Re-reads [teamIds] and broadcasts their rows after commit. */
    private fun broadcastTeams(eventId: UUID, teamIds: List<UUID>): App<Nothing, Unit> = KIO.comprehension {
        val rows = !resolveRows(eventId)
        broadcastAsync(eventId, rows.filter { teamIds.contains(it.competitionMatchTeam) })
        KIO.ok(Unit)
    }

    // Mirrors TimingService.broadcastAsync: mutations run inside respondKIO's transaction, so the
    // broadcast must wait for its commit - AfterCommit buffers it there (and runs it immediately for
    // non-HTTP callers).
    private fun broadcastAsync(eventId: UUID, results: List<TimingResultDto>) {
        if (results.isEmpty()) return
        AfterCommit.register {
            TimingBroadcaster.broadcast(eventId, TimingWsMessage.ResultChanged(results))
        }
    }
}
