package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.competitionExecution.control.CompetitionMatchTeamLapRepo
import de.lambda9.ready2race.backend.app.competitionExecution.control.CompetitionMatchTeamRepo
import de.lambda9.ready2race.backend.app.timing.boundary.TimingSequenceService
import de.lambda9.ready2race.backend.app.timing.boundary.TimingService
import de.lambda9.ready2race.backend.app.timing.control.TimingSequenceRepo
import de.lambda9.ready2race.backend.app.timing.entity.AssignTimeMarkRequest
import de.lambda9.ready2race.backend.app.timing.entity.CreateSequenceRequest
import de.lambda9.ready2race.backend.app.timing.entity.SequenceMode
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationType
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_MATCH
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_MATCH_TEAM_LAP
import de.lambda9.ready2race.backend.database.generated.tables.references.EVENT
import de.lambda9.ready2race.testing.testComprehension
import de.lambda9.tailwind.core.extensions.kio.orDie
import de.lambda9.tailwind.jooq.Jooq
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Rule 3 and 4 of the port plan: marks on SPLIT stations become `competition_match_team_lap` rows,
 * and a fired start sequence stamps `competition_match.started_at` - the two writes that make the
 * base's existing views (Rundenband, boards, LiveDashboard, stream clock) work with internal timing
 * without knowing anything about it.
 */
class TimingLapServiceTest {

    @Test
    fun splitMarkBecomesALap() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val startStation = !addTestStation(eventId, userId, TimingStationType.START, sorting = 1, name = "Start")
        val splitStation = !addTestStation(eventId, userId, TimingStationType.SPLIT, sorting = 2, name = "Runde 1")
        val teamId = !createTestMatchTeam(eventId)

        !addAssignedMark(eventId, userId, startStation, teamId, START_MILLIS)
        !addAssignedMark(eventId, userId, splitStation, teamId, START_MILLIS + 30_000)

        val lap = (!CompetitionMatchTeamLapRepo.getByTeams(listOf(teamId)).orDie()).single()
        assertEquals("Runde 1", lap.name)
        assertEquals(2, lap.position)
        assertEquals(30_000L, lap.lapMillis)
    }

    // The Rundenband of the livestream sorts by "when did this mark first arrive". Replacing the row
    // on every recompute would reset that stamp and destroy the order - hence the upsert.
    @Test
    fun recomputingALapPreservesItsCreatedAt() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val startStation = !addTestStation(eventId, userId, TimingStationType.START, sorting = 1, name = "Start")
        val splitStation = !addTestStation(eventId, userId, TimingStationType.SPLIT, sorting = 2, name = "Runde 1")
        val teamId = !createTestMatchTeam(eventId)
        !addAssignedMark(eventId, userId, startStation, teamId, START_MILLIS)
        !addAssignedMark(eventId, userId, splitStation, teamId, START_MILLIS + 30_000)

        val firstSeen = LocalDateTime.now().minusHours(2)
        !Jooq.query {
            update(COMPETITION_MATCH_TEAM_LAP)
                .set(COMPETITION_MATCH_TEAM_LAP.CREATED_AT, firstSeen)
                .where(COMPETITION_MATCH_TEAM_LAP.COMPETITION_MATCH_TEAM.eq(teamId))
                .execute()
        }.orDie()

        // A second crossing of the same split station: the earlier one stays the real one, but the
        // whole set is recomputed - and must not lose the stamp.
        !addAssignedMark(eventId, userId, splitStation, teamId, START_MILLIS + 45_000)

        val lap = (!CompetitionMatchTeamLapRepo.getByTeams(listOf(teamId)).orDie()).single()
        assertEquals(30_000L, lap.lapMillis)
        assertEquals(firstSeen, lap.createdAt)
    }

    @Test
    fun aLaterStartMarkRecomputesTheLaps() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val startStation = !addTestStation(eventId, userId, TimingStationType.START, sorting = 1, name = "Start")
        val splitStation = !addTestStation(eventId, userId, TimingStationType.SPLIT, sorting = 2, name = "Runde 1")
        val teamId = !createTestMatchTeam(eventId)
        !addAssignedMark(eventId, userId, startStation, teamId, START_MILLIS)
        !addAssignedMark(eventId, userId, splitStation, teamId, START_MILLIS + 30_000)

        // Restart: the later start mark is the one the boat took, so every lap of that boat shifts.
        !addAssignedMark(eventId, userId, startStation, teamId, START_MILLIS + 10_000)

        val lap = (!CompetitionMatchTeamLapRepo.getByTeams(listOf(teamId)).orDie()).single()
        assertEquals(20_000L, lap.lapMillis)
    }

    @Test
    fun retractingASplitMarkRemovesItsLap() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val startStation = !addTestStation(eventId, userId, TimingStationType.START, sorting = 1, name = "Start")
        val splitStation = !addTestStation(eventId, userId, TimingStationType.SPLIT, sorting = 2, name = "Runde 1")
        val teamId = !createTestMatchTeam(eventId)
        !addAssignedMark(eventId, userId, startStation, teamId, START_MILLIS)
        val splitMark = !addAssignedMark(eventId, userId, splitStation, teamId, START_MILLIS + 30_000)

        !TimingService.retractTimeMark(splitMark, eventId, userId)

        assertEquals(emptyList(), !CompetitionMatchTeamLapRepo.getByTeams(listOf(teamId)).orDie())
    }

    @Test
    fun reassigningASplitMarkMovesTheLapToTheOtherTeam() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val startStation = !addTestStation(eventId, userId, TimingStationType.START, sorting = 1, name = "Start")
        val splitStation = !addTestStation(eventId, userId, TimingStationType.SPLIT, sorting = 2, name = "Runde 1")
        val teams = !createTestMatchTeams(eventId, 2)
        teams.forEach { !addAssignedMark(eventId, userId, startStation, it, START_MILLIS) }
        val splitMark = !addAssignedMark(eventId, userId, splitStation, teams[0], START_MILLIS + 30_000)

        !TimingService.assignTimeMark(AssignTimeMarkRequest(teams[1]), userId, splitMark, eventId)

        assertEquals(emptyList(), !CompetitionMatchTeamLapRepo.getByTeams(listOf(teams[0])).orDie())
        assertEquals(
            30_000L,
            (!CompetitionMatchTeamLapRepo.getByTeams(listOf(teams[1])).orDie()).single().lapMillis,
        )
    }

    @Test
    fun aSplitWithoutAStartWritesNoLap() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val splitStation = !addTestStation(eventId, userId, TimingStationType.SPLIT, sorting = 2, name = "Runde 1")
        val teamId = !createTestMatchTeam(eventId)

        !addAssignedMark(eventId, userId, splitStation, teamId, START_MILLIS + 30_000)

        assertEquals(emptyList(), !CompetitionMatchTeamLapRepo.getByTeams(listOf(teamId)).orDie())
    }

    // ------------------------------------------------- the boat's own measured start

    // The column applyLapsFromFeed fills from the RaceClocker feed: the time-trial views read it to
    // tell who is already on the water, because competition_match.started_at only says that SOMEBODY
    // started.
    @Test
    fun assigningAStartMarkStampsTheTeamsOwnStart() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val startStation = !addTestStation(eventId, userId, TimingStationType.START, sorting = 1, name = "Start")
        val teamId = !createTestMatchTeam(eventId)

        !addAssignedMark(eventId, userId, startStation, teamId, START_MILLIS)

        val expected = LocalDateTime.ofInstant(Instant.ofEpochMilli(START_MILLIS), ZoneId.systemDefault())
        assertEquals(expected, (!CompetitionMatchTeamRepo.getById(teamId).orDie())!!.startedAt)
    }

    // Unlike the match stamp this one follows the marks: a restart moves it.
    @Test
    fun aLaterStartMarkMovesTheTeamsOwnStart() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val startStation = !addTestStation(eventId, userId, TimingStationType.START, sorting = 1, name = "Start")
        val teamId = !createTestMatchTeam(eventId)
        !addAssignedMark(eventId, userId, startStation, teamId, START_MILLIS)

        !addAssignedMark(eventId, userId, startStation, teamId, START_MILLIS + 10_000)

        val expected = LocalDateTime.ofInstant(Instant.ofEpochMilli(START_MILLIS + 10_000), ZoneId.systemDefault())
        assertEquals(expected, (!CompetitionMatchTeamRepo.getById(teamId).orDie())!!.startedAt)
    }

    @Test
    fun retractingTheStartMarkClearsTheTeamsOwnStart() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val startStation = !addTestStation(eventId, userId, TimingStationType.START, sorting = 1, name = "Start")
        val teamId = !createTestMatchTeam(eventId)
        val markId = !addAssignedMark(eventId, userId, startStation, teamId, START_MILLIS)
        assertNotNull((!CompetitionMatchTeamRepo.getById(teamId).orDie())!!.startedAt)

        !TimingService.retractTimeMark(markId, eventId, userId)

        assertNull((!CompetitionMatchTeamRepo.getById(teamId).orDie())!!.startedAt)
    }

    @Test
    fun unassigningTheStartMarkClearsTheTeamsOwnStart() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val startStation = !addTestStation(eventId, userId, TimingStationType.START, sorting = 1, name = "Start")
        val teamId = !createTestMatchTeam(eventId)
        val markId = !addAssignedMark(eventId, userId, startStation, teamId, START_MILLIS)

        !TimingService.assignTimeMark(AssignTimeMarkRequest(null), userId, markId, eventId)

        assertNull((!CompetitionMatchTeamRepo.getById(teamId).orDie())!!.startedAt)
    }

    // Re-assigning moves the stamp along with the mark - both boats are recomputed.
    @Test
    fun reassigningAStartMarkMovesTheStampToTheOtherTeam() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val startStation = !addTestStation(eventId, userId, TimingStationType.START, sorting = 1, name = "Start")
        val teams = !createTestMatchTeams(eventId, 2)
        val markId = !addAssignedMark(eventId, userId, startStation, teams[0], START_MILLIS)

        !TimingService.assignTimeMark(AssignTimeMarkRequest(teams[1]), userId, markId, eventId)

        assertNull((!CompetitionMatchTeamRepo.getById(teams[0]).orDie())!!.startedAt)
        assertNotNull((!CompetitionMatchTeamRepo.getById(teams[1]).orDie())!!.startedAt)
    }

    // Rule 4: what a fired sequence does to the match itself.
    @Test
    fun firingAStartSequenceStampsTheMatchAsStarted() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START, sorting = 1, name = "Start")
        val teamId = !createTestMatchTeam(eventId)
        val matchId = (!CompetitionMatchTeamRepo.getById(teamId).orDie())!!.competitionMatch

        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.MASS, null, listOf(teamId), LEAD_IN),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id
        !TimingSequenceService.startSequence(sequenceId, userId, eventId)
        !TimingSequenceRepo.update(sequenceId) {
            startedAtMillis = System.currentTimeMillis() - 100 - LEAD_IN
        }.orDie()

        val fired = !TimingSequenceService.fireDueEntries()
        assertEquals(1, fired.fired.size)

        val match = !Jooq.query {
            selectFrom(COMPETITION_MATCH).where(COMPETITION_MATCH.COMPETITION_SETUP_MATCH.eq(matchId)).fetchOne()
        }.orDie()
        assertNotNull(match)
        assertNotNull(match.startedAt)
        assertNotNull(match.activatedAt)
    }

    // Idempotent like markMatchStarted: a heat that was already called to the line keeps its
    // original instant when the sequence fires.
    @Test
    fun firingDoesNotMoveAnExistingStartStamp() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START, sorting = 1, name = "Start")
        val teamId = !createTestMatchTeam(eventId)
        val matchId = (!CompetitionMatchTeamRepo.getById(teamId).orDie())!!.competitionMatch
        val earlier = LocalDateTime.now().minusMinutes(5)
        !Jooq.query {
            update(COMPETITION_MATCH)
                .set(COMPETITION_MATCH.STARTED_AT, earlier)
                .where(COMPETITION_MATCH.COMPETITION_SETUP_MATCH.eq(matchId))
                .execute()
        }.orDie()

        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.MASS, null, listOf(teamId), LEAD_IN),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id
        !TimingSequenceService.startSequence(sequenceId, userId, eventId)
        !TimingSequenceRepo.update(sequenceId) {
            startedAtMillis = System.currentTimeMillis() - 100 - LEAD_IN
        }.orDie()
        !TimingSequenceService.fireDueEntries()

        val match = !Jooq.query {
            selectFrom(COMPETITION_MATCH).where(COMPETITION_MATCH.COMPETITION_SETUP_MATCH.eq(matchId)).fetchOne()
        }.orDie()
        assertEquals(earlier, match!!.startedAt)
        assertTrue(match.activatedAt != null)
    }

    // The same guard CompetitionExecutionService.markMatchStarted carries: a challenge event has no
    // heats that run, so `started_at` means nothing there. A silent skip rather than an error - the
    // caller is the scheduler, there is no request to answer, and the mark itself stays valid.
    @Test
    fun firingInAChallengeEventDoesNotStampTheMatch() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !Jooq.query {
            update(EVENT).set(EVENT.CHALLENGE_EVENT, true).where(EVENT.ID.eq(eventId)).execute()
        }.orDie()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START, sorting = 1, name = "Start")
        val teamId = !createTestMatchTeam(eventId)
        val matchId = (!CompetitionMatchTeamRepo.getById(teamId).orDie())!!.competitionMatch

        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.MASS, null, listOf(teamId), LEAD_IN),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id
        !TimingSequenceService.startSequence(sequenceId, userId, eventId)
        !TimingSequenceRepo.update(sequenceId) {
            startedAtMillis = System.currentTimeMillis() - 100 - LEAD_IN
        }.orDie()

        val fired = !TimingSequenceService.fireDueEntries()
        assertEquals(1, fired.fired.size)

        val match = !Jooq.query {
            selectFrom(COMPETITION_MATCH).where(COMPETITION_MATCH.COMPETITION_SETUP_MATCH.eq(matchId)).fetchOne()
        }.orDie()
        assertNull(match!!.startedAt)
        assertNull(match.activatedAt)
        // The boat's own start still follows its mark - only the match stamp is skipped.
        assertNotNull((!CompetitionMatchTeamRepo.getById(teamId).orDie())!!.startedAt)
    }
}

private const val START_MILLIS = 1755430000000L
private const val LEAD_IN = 3000L
