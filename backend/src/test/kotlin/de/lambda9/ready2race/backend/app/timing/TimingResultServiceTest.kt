package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.competitionExecution.control.CompetitionMatchTeamRepo
import de.lambda9.ready2race.backend.app.timing.boundary.TimingResultService
import de.lambda9.ready2race.backend.app.timing.boundary.TimingService
import de.lambda9.ready2race.backend.app.timing.entity.*
import de.lambda9.ready2race.backend.data.Timecode
import de.lambda9.ready2race.backend.database.generated.tables.references.TIMECODE
import de.lambda9.ready2race.testing.testComprehension
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.jooq.Jooq
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The results layer: the live computation from assigned marks, the judged part (penalty, status)
 * entered in the Leitstand, and the push into the existing `timecode` results flow.
 */
class TimingResultServiceTest {

    private val startMillis = START_MILLIS
    private val finishMillis = START_MILLIS + 90_000L

    // ------------------------------------------------------------- computation

    @Test
    fun resultUsesAssignedStartAndFinishMarks() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val teamId = !timedTeam(eventId, userId)

        val row = (!TimingResultService.getResults(eventId)).data.single()

        assertEquals(teamId, row.competitionMatchTeam)
        assertEquals(startMillis, row.startMillis)
        assertEquals(finishMillis, row.finishMillis)
        assertEquals(90_000L, row.measuredMillis)
        assertEquals(90_000L, row.computedFinalMillis)
        assertNull(row.skipReason)
        assertEquals(TimingResultStatus.NONE, row.resultStatus)
        assertFalse(row.pushed)
        assertFalse(row.frozen)
    }

    @Test
    fun resultReportsMissingStartMark() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val finishStation = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val teamId = !createTestMatchTeam(eventId)
        !addAssignedMark(eventId, userId, finishStation, teamId, finishMillis)

        val row = (!TimingResultService.getResults(eventId)).data.single()

        assertEquals(TimingResultSkipReason.NO_START_MARK, row.skipReason)
        assertNull(row.computedFinalMillis)
    }

    @Test
    fun resultReportsMissingFinishMark() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val startStation = !addTestStation(eventId, userId, TimingStationType.START)
        val teamId = !createTestMatchTeam(eventId)
        !addAssignedMark(eventId, userId, startStation, teamId, startMillis)

        val row = (!TimingResultService.getResults(eventId)).data.single()

        assertEquals(TimingResultSkipReason.NO_FINISH_MARK, row.skipReason)
    }

    @Test
    fun resultReportsNegativeDuration() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val startStation = !addTestStation(eventId, userId, TimingStationType.START)
        val finishStation = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val teamId = !createTestMatchTeam(eventId)
        !addAssignedMark(eventId, userId, startStation, teamId, finishMillis)
        !addAssignedMark(eventId, userId, finishStation, teamId, startMillis)

        val row = (!TimingResultService.getResults(eventId)).data.single()

        assertEquals(TimingResultSkipReason.NEGATIVE_DURATION, row.skipReason)
        assertNull(row.computedFinalMillis)
    }

    @Test
    fun resultIgnoresRetractedMarks() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val startStation = !addTestStation(eventId, userId, TimingStationType.START)
        val finishStation = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val teamId = !createTestMatchTeam(eventId)
        !addAssignedMark(eventId, userId, startStation, teamId, startMillis)
        val finishMarkId = !addAssignedMark(eventId, userId, finishStation, teamId, finishMillis)
        !TimingService.retractTimeMark(finishMarkId, eventId, userId)

        val row = (!TimingResultService.getResults(eventId)).data.single()

        assertEquals(TimingResultSkipReason.NO_FINISH_MARK, row.skipReason)
    }

    // A boat that was restarted has two start marks; the later one is the start it actually took.
    // A double-tapped finish is the mirror case: the first crossing is the real one.
    @Test
    fun resultUsesLatestStartAndEarliestFinish() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val startStation = !addTestStation(eventId, userId, TimingStationType.START)
        val finishStation = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val teamId = !createTestMatchTeam(eventId)
        !addAssignedMark(eventId, userId, startStation, teamId, startMillis)
        !addAssignedMark(eventId, userId, startStation, teamId, startMillis + 10_000)
        !addAssignedMark(eventId, userId, finishStation, teamId, finishMillis)
        !addAssignedMark(eventId, userId, finishStation, teamId, finishMillis + 5_000)

        val row = (!TimingResultService.getResults(eventId)).data.single()

        assertEquals(80_000L, row.computedFinalMillis)
    }

    // ------------------------------------------------------------- entry (PUT)

    @Test
    fun penaltyIsComputedIntoTheFinalTime() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val teamId = !timedTeam(eventId, userId)

        !TimingResultService.setResultEntry(
            eventId,
            teamId,
            TimingResultEntryRequest(penaltySeconds = 5, penaltyNote = "Boje", resultStatus = null),
            userId,
        )

        val row = (!TimingResultService.getResults(eventId)).data.single()
        assertEquals(90_000L, row.measuredMillis)
        assertEquals(95_000L, row.computedFinalMillis)
        assertEquals(5, row.penaltySeconds)
        assertEquals("Boje", row.penaltyNote)
    }

    @Test
    fun statusSupersedesAnyTimeAndFlagsTheTeamFailed() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val teamId = !timedTeam(eventId, userId)

        !TimingResultService.setResultEntry(
            eventId,
            teamId,
            TimingResultEntryRequest(resultStatus = TimingResultStatus.DSQ),
            userId,
        )

        val row = (!TimingResultService.getResults(eventId)).data.single()
        assertEquals(TimingResultStatus.DSQ, row.resultStatus)
        assertEquals(90_000L, row.measuredMillis)
        assertNull(row.computedFinalMillis)
        assertTrue(row.pushed)

        val team = !CompetitionMatchTeamRepo.getById(teamId)
        assertTrue(team!!.failed!!)
        // Written as DSQ, never as the DQ alias the frontend also understands.
        assertEquals("DSQ", team.failedReason)
    }

    @Test
    fun statusNoneClearsPenaltyAndFailedState() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val teamId = !timedTeam(eventId, userId)
        !TimingResultService.setResultEntry(
            eventId,
            teamId,
            TimingResultEntryRequest(penaltySeconds = 5, penaltyNote = "Boje", resultStatus = TimingResultStatus.DNF),
            userId,
        )

        !TimingResultService.setResultEntry(eventId, teamId, TimingResultEntryRequest(), userId)

        val team = !CompetitionMatchTeamRepo.getById(teamId)
        assertFalse(team!!.failed!!)
        assertNull(team.failedReason)
        assertNull(team.penaltySeconds)
        assertNull(team.penaltyNote)
    }

    // A DSQ entered while a time was already pushed must not leave that time standing.
    @Test
    fun statusEntryDropsAPreviouslyPushedTime() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val teamId = !timedTeam(eventId, userId)
        !TimingResultService.pushResults(eventId, PushTimingResultsRequest(listOf(teamId)), userId)
        assertNotNull((!CompetitionMatchTeamRepo.getById(teamId))!!.timecode)

        !TimingResultService.setResultEntry(
            eventId,
            teamId,
            TimingResultEntryRequest(resultStatus = TimingResultStatus.DSQ),
            userId,
        )

        assertNull((!CompetitionMatchTeamRepo.getById(teamId))!!.timecode)
        assertEquals(0, (!Jooq.query { selectFrom(TIMECODE).fetch() }).size)
    }

    @Test
    fun resultListsTeamWithStatusButWithoutAnyMarks() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val teamId = !createTestMatchTeam(eventId)

        !TimingResultService.setResultEntry(
            eventId,
            teamId,
            TimingResultEntryRequest(resultStatus = TimingResultStatus.DNS),
            userId,
        )

        val row = (!TimingResultService.getResults(eventId)).data.single()
        assertEquals(teamId, row.competitionMatchTeam)
        assertEquals(TimingResultStatus.DNS, row.resultStatus)
        assertEquals(TimingResultSkipReason.NO_MARKS, row.skipReason)
    }

    @Test
    fun entryFailsForTeamOfDifferentEvent() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val (otherEventId, _) = !createTestEventWithAdmin()
        val teamId = !createTestMatchTeam(otherEventId)

        assertKIOFails(TimingError.EventMismatch) {
            TimingResultService.setResultEntry(eventId, teamId, TimingResultEntryRequest(), userId)
        }
    }

    // ---------------------------------------------------------------- push

    @Test
    fun pushWritesTimecodeLikeTheManualEntryPath() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val teamId = !timedTeam(eventId, userId)

        !TimingResultService.pushResults(
            eventId,
            PushTimingResultsRequest(listOf(teamId), force = false),
            userId,
        )

        val team = !CompetitionMatchTeamRepo.getById(teamId)
        assertNotNull(team)
        // Exactly what CompetitionExecutionService.updateMatchResult(-ByFile) writes: the timecode
        // row carries the match team's own id, the millis of the time, and the base unit /
        // millisecond precision Parser.timecode derives for that value.
        assertEquals(teamId, team.timecode)
        val timecode = !Jooq.query { selectFrom(TIMECODE).where(TIMECODE.ID.eq(teamId)).fetchOne() }
        assertNotNull(timecode)
        assertEquals(90_000L, timecode.time)
        assertEquals(Timecode.BaseUnit.MINUTES.name, timecode.baseUnit)
        assertEquals(Timecode.MillisecondPrecision.THREE.name, timecode.millisecondPrecision)
        // The push never touches places or the failed state of a finisher.
        assertFalse(team.failed!!)
        assertNull(team.failedReason)
        assertNull(team.place)
        assertFalse(team.placesCalculated!!)

        assertTrue((!TimingResultService.getResults(eventId)).data.single().pushed)
    }

    @Test
    fun pushUsesSecondsBaseUnitBelowAMinute() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val teamId = !timedTeam(eventId, userId, durationMillis = 42_100)

        !TimingResultService.pushResults(eventId, PushTimingResultsRequest(listOf(teamId)), userId)

        val timecode = !Jooq.query { selectFrom(TIMECODE).where(TIMECODE.ID.eq(teamId)).fetchOne() }
        assertEquals(42_100L, timecode!!.time)
        assertEquals(Timecode.BaseUnit.SECONDS.name, timecode.baseUnit)
    }

    // The core of the new semantics: for internal timing the finish mark is raw, so the pushed time
    // has to carry the penalty - the base's views all assume the shown time already includes it.
    @Test
    fun pushWritesTheTimeIncludingThePenalty() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val teamId = !timedTeam(eventId, userId)
        !TimingResultService.setResultEntry(
            eventId,
            teamId,
            TimingResultEntryRequest(penaltySeconds = 5, penaltyNote = "Boje"),
            userId,
        )

        !TimingResultService.pushResults(eventId, PushTimingResultsRequest(listOf(teamId)), userId)

        val timecode = !Jooq.query { selectFrom(TIMECODE).where(TIMECODE.ID.eq(teamId)).fetchOne() }
        assertEquals(95_000L, timecode!!.time)
        val team = !CompetitionMatchTeamRepo.getById(teamId)
        assertEquals(5, team!!.penaltySeconds)
        assertEquals("Boje", team.penaltyNote)
    }

    @Test
    fun pushIsIdempotentAndReplacesAnExistingTimecode() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val teamId = !timedTeam(eventId, userId)
        !TimingResultService.pushResults(eventId, PushTimingResultsRequest(listOf(teamId)), userId)

        !TimingResultService.setResultEntry(eventId, teamId, TimingResultEntryRequest(penaltySeconds = 10), userId)
        !TimingResultService.pushResults(eventId, PushTimingResultsRequest(listOf(teamId)), userId)

        val timecodes = !Jooq.query { selectFrom(TIMECODE).fetch() }
        assertEquals(1, timecodes.size)
        assertEquals(100_000L, timecodes.first().time)
        assertEquals(teamId, (!CompetitionMatchTeamRepo.getById(teamId))!!.timecode)
    }

    // DNS/DNF/DSQ mirror the import's no-result handling: no timecode at all, the status token in
    // failed_reason, and the team flagged failed.
    @Test
    fun pushOfNonFinisherWritesFailedInsteadOfTimecode() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val teamId = !timedTeam(eventId, userId)
        !TimingResultService.setResultEntry(
            eventId,
            teamId,
            TimingResultEntryRequest(resultStatus = TimingResultStatus.DNF),
            userId,
        )

        !TimingResultService.pushResults(eventId, PushTimingResultsRequest(listOf(teamId)), userId)

        val team = !CompetitionMatchTeamRepo.getById(teamId)
        assertNull(team!!.timecode)
        assertTrue(team.failed!!)
        assertEquals("DNF", team.failedReason)
        assertEquals(0, (!Jooq.query { selectFrom(TIMECODE).fetch() }).size)
    }

    @Test
    fun pushFailsWhenPlacesAreCalculated() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val teamId = !timedTeam(eventId, userId)
        !CompetitionMatchTeamRepo.updateById(teamId) { placesCalculated = true }

        assertKIOFails(
            TimingError.PushConflict(listOf(TimingResultPushConflictDto(teamId, PushConflictReason.RESULT_FROZEN)))
        ) {
            TimingResultService.pushResults(eventId, PushTimingResultsRequest(listOf(teamId)), userId)
        }
        assertNull((!CompetitionMatchTeamRepo.getById(teamId))!!.timecode)
    }

    @Test
    fun pushFailsWhenTeamAlreadyHasAPlace() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val teamId = !timedTeam(eventId, userId)
        !CompetitionMatchTeamRepo.updateById(teamId) { place = 1 }

        assertKIOFails(
            TimingError.PushConflict(listOf(TimingResultPushConflictDto(teamId, PushConflictReason.RESULT_FROZEN)))
        ) {
            TimingResultService.pushResults(eventId, PushTimingResultsRequest(listOf(teamId)), userId)
        }
    }

    // A referee can record a non-finisher without ever calculating places - `failed` alone is just
    // as much a worked-on result and freezes the push the same way. The reason is the referee's own
    // free text here, which is what tells the two cases apart (see the next test).
    @Test
    fun pushFailsWhenARefereeFlaggedTheTeamFailed() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val teamId = !timedTeam(eventId, userId)
        !CompetitionMatchTeamRepo.updateById(teamId) { failed = true; failedReason = "Bootsschaden" }

        assertKIOFails(
            TimingError.PushConflict(listOf(TimingResultPushConflictDto(teamId, PushConflictReason.RESULT_FROZEN)))
        ) {
            TimingResultService.pushResults(eventId, PushTimingResultsRequest(listOf(teamId)), userId)
        }
        assertNull((!CompetitionMatchTeamRepo.getById(teamId))!!.timecode)
    }

    // The counterpart: a status entered in the Leitstand writes `failed` itself, so a strict
    // "failed freezes" would lock timing out of its own entry.
    @Test
    fun pushOfAStatusEnteredInTheLeitstandIsNotFrozen() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val teamId = !timedTeam(eventId, userId)
        !TimingResultService.setResultEntry(
            eventId,
            teamId,
            TimingResultEntryRequest(resultStatus = TimingResultStatus.DSQ),
            userId,
        )

        !TimingResultService.pushResults(eventId, PushTimingResultsRequest(listOf(teamId)), userId)

        val team = !CompetitionMatchTeamRepo.getById(teamId)
        assertTrue(team!!.failed!!)
        assertEquals("DSQ", team.failedReason)
    }

    @Test
    fun forcePushOverridesTheFreeze() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val teamId = !timedTeam(eventId, userId)
        !CompetitionMatchTeamRepo.updateById(teamId) { placesCalculated = true }

        !TimingResultService.pushResults(
            eventId,
            PushTimingResultsRequest(listOf(teamId), force = true),
            userId,
        )

        val team = !CompetitionMatchTeamRepo.getById(teamId)
        assertEquals(teamId, team!!.timecode)
        // Force overrides the freeze boundary only - places stay exactly as the referee left them.
        assertTrue(team.placesCalculated!!)
    }

    @Test
    fun pushWithoutFinalTimeFailsEvenWhenForced() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val teamId = !createTestMatchTeam(eventId)

        assertKIOFails(
            TimingError.PushConflict(listOf(TimingResultPushConflictDto(teamId, PushConflictReason.NO_FINAL_TIME)))
        ) {
            TimingResultService.pushResults(
                eventId,
                PushTimingResultsRequest(listOf(teamId), force = true),
                userId,
            )
        }
    }

    @Test
    fun pushIsAllOrNothing() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val startStation = !addTestStation(eventId, userId, TimingStationType.START)
        val finishStation = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val teams = !createTestMatchTeams(eventId, 2)
        teams.forEach { teamId ->
            !addAssignedMark(eventId, userId, startStation, teamId, startMillis)
            !addAssignedMark(eventId, userId, finishStation, teamId, finishMillis)
        }
        !CompetitionMatchTeamRepo.updateById(teams[1]) { placesCalculated = true }

        assertKIOFails(
            TimingError.PushConflict(listOf(TimingResultPushConflictDto(teams[1], PushConflictReason.RESULT_FROZEN)))
        ) {
            TimingResultService.pushResults(eventId, PushTimingResultsRequest(teams), userId)
        }
        assertNull((!CompetitionMatchTeamRepo.getById(teams[0]))!!.timecode)
    }

    // "Push everything" is the running-regatta button: boats still on the water are reported, not
    // treated as an error that blocks the whole round.
    @Test
    fun pushAllSkipsTeamsWithoutAFinalTime() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val startStation = !addTestStation(eventId, userId, TimingStationType.START)
        val finishStation = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val teams = !createTestMatchTeams(eventId, 2)
        teams.forEach { teamId -> !addAssignedMark(eventId, userId, startStation, teamId, startMillis) }
        !addAssignedMark(eventId, userId, finishStation, teams[0], finishMillis)

        val result = (!TimingResultService.pushResults(eventId, PushTimingResultsRequest(), userId)).dto

        assertEquals(listOf(teams[0]), result.pushed.map { it.competitionMatchTeam })
        assertEquals(
            listOf(TimingResultSkipDto(teams[1], TimingResultSkipReason.NO_FINISH_MARK)),
            result.skipped,
        )
        assertEquals(teams[0], (!CompetitionMatchTeamRepo.getById(teams[0]))!!.timecode)
        assertNull((!CompetitionMatchTeamRepo.getById(teams[1]))!!.timecode)
    }
}

/** A team whose assigned marks yield a measured time of [durationMillis]. */
private fun timedTeam(
    eventId: UUID,
    userId: UUID,
    durationMillis: Long = 90_000,
): App<Any?, UUID> = KIO.comprehension {
    val startStation = !addTestStation(eventId, userId, TimingStationType.START)
    val finishStation = !addTestStation(eventId, userId, TimingStationType.FINISH)
    val teamId = !createTestMatchTeam(eventId)
    !addAssignedMark(eventId, userId, startStation, teamId, START_MILLIS)
    !addAssignedMark(eventId, userId, finishStation, teamId, START_MILLIS + durationMillis)
    KIO.ok(teamId)
}

private const val START_MILLIS = 1755430000000L
