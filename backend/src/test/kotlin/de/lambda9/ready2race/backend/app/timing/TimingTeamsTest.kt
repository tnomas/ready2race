package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.competitionExecution.control.CompetitionMatchRepo
import de.lambda9.ready2race.backend.app.competitionExecution.control.CompetitionMatchTeamRepo
import de.lambda9.ready2race.backend.app.timing.boundary.TimingService
import de.lambda9.ready2race.backend.app.timing.entity.TimingMatchPhase
import de.lambda9.ready2race.backend.app.timing.entity.TimingTeamDto
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionMatchRecord
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.orDie
import de.lambda9.ready2race.testing.testComprehension
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class TimingTeamsTest {

    @Test
    fun getTeamsReturnsFixtureTeam() = testComprehension {
        val (eventId, _) = !createTestEventWithAdmin()
        val teamId = !createTestMatchTeam(eventId)

        val response = !TimingService.getTeams(eventId)
        val list = (response as ApiResponse.ListDto<TimingTeamDto>).data

        assertEquals(1, list.size)
        val team = list.first()

        // Assert join field mapping
        assertEquals(teamId, team.competitionMatchTeam)
        assertEquals(1, team.startNumber)
        assertEquals("Timing Test Competition", team.competitionName)
        assertTrue(team.clubName?.startsWith("Timing Test Club-") == true, "Club name should match fixture pattern")
        assertEquals(emptyList(), team.participantNames, "Fixture creates no participants")
    }

    @Test
    fun getTeamsReturnsEmptyForOtherEvent() = testComprehension {
        val (eventId, _) = !createTestEventWithAdmin()
        !createTestMatchTeam(eventId)

        val (otherEventId, _) = !createTestEventWithAdmin()

        val response = !TimingService.getTeams(otherEventId)
        val list = (response as ApiResponse.ListDto<TimingTeamDto>).data

        assertTrue(list.isEmpty())
    }

    // The boards need to know which teams are expected right now: the phase separates the teams of
    // activated matches (ACTIVE) from those that are merely scheduled (OPEN) and those whose match
    // is over (DONE), so grids and assignment lists can put the relevant ones first instead of
    // drowning them in the whole event.

    @Test
    fun getTeamsDerivesTheMatchPhase() = testComprehension {
        val (eventId, _) = !createTestEventWithAdmin()
        val activeTeam = !createTestMatchTeam(eventId)
        val openTeam = !createTestMatchTeam(eventId)
        val doneTeam = !createTestMatchTeam(eventId)
        !updateMatch(activeTeam) { activatedAt = LocalDateTime.now() }
        !updateMatch(doneTeam) { finishedAt = LocalDateTime.now() }

        val response = !TimingService.getTeams(eventId)
        val byId = (response as ApiResponse.ListDto<TimingTeamDto>).data.associateBy { it.competitionMatchTeam }

        assertEquals(TimingMatchPhase.ACTIVE, byId[activeTeam]!!.matchPhase)
        assertEquals(TimingMatchPhase.OPEN, byId[openTeam]!!.matchPhase)
        assertEquals(TimingMatchPhase.DONE, byId[doneTeam]!!.matchPhase)
    }

    @Test
    fun getTeamsPhaseFollowsDeriveMatchStateBranchOrder() = testComprehension {
        val (eventId, _) = !createTestEventWithAdmin()
        val teamId = !createTestMatchTeam(eventId)
        // Both set: activation wins, exactly like LiveDashboardLogic.deriveMatchState checks
        // activated_at before finished_at - the two derivations must never disagree.
        !updateMatch(teamId) {
            activatedAt = LocalDateTime.now()
            finishedAt = LocalDateTime.now()
        }

        val response = !TimingService.getTeams(eventId)
        val team = (response as ApiResponse.ListDto<TimingTeamDto>).data.single()

        assertEquals(TimingMatchPhase.ACTIVE, team.matchPhase)
    }

    // A bye is never raced, so its team must not be offered for capture or assignment - unless the
    // bye was explicitly set to "muss gefahren werden".

    @Test
    fun getTeamsExcludesByeTeams() = testComprehension {
        val (eventId, _) = !createTestEventWithAdmin()
        val racingTeam = !createTestMatchTeam(eventId)
        val byeTeam = !createTestMatchTeam(eventId)
        !updateMatch(byeTeam) { byeName = "Freilos 1" }

        val response = !TimingService.getTeams(eventId)
        val list = (response as ApiResponse.ListDto<TimingTeamDto>).data

        assertEquals(listOf(racingTeam), list.map { it.competitionMatchTeam })
    }

    @Test
    fun getTeamsKeepsAByeThatMustRace() = testComprehension {
        val (eventId, _) = !createTestEventWithAdmin()
        val byeTeam = !createTestMatchTeam(eventId)
        !updateMatch(byeTeam) {
            byeName = "Freilos 1"
            byeMustRace = true
        }

        val response = !TimingService.getTeams(eventId)
        val list = (response as ApiResponse.ListDto<TimingTeamDto>).data

        assertEquals(listOf(byeTeam), list.map { it.competitionMatchTeam })
    }

    /** Updates the competition_match instance the fixture created for [teamId]'s match. */
    private fun updateMatch(
        teamId: UUID,
        f: CompetitionMatchRecord.() -> Unit,
    ) = KIO.comprehension {
        val matchId = (!CompetitionMatchTeamRepo.getById(teamId).orDie())!!.competitionMatch!!
        !CompetitionMatchRepo.update(matchId, f).orDie()
        KIO.ok(Unit)
    }
}
