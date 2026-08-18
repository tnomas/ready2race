package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.timing.boundary.TimingService
import de.lambda9.ready2race.backend.app.timing.entity.TimingTeamDto
import de.lambda9.ready2race.backend.app.timingConfig.entity.TimingSystem
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.testing.testComprehension
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

    // The assignment UI is built from this list, so a boat that is timed elsewhere must not even be
    // offerable - it is the first half of the protection whose second half is the refused assignment
    // (TimeMarkServiceTest.assignFailsForATeamOfAnotherTimingSystem).
    @Test
    fun getTeamsExcludesCompetitionsOfAnotherTimingSystem() = testComprehension {
        val (eventId, _) = !createTestEventWithAdmin()
        val ownTeam = !createTestMatchTeam(eventId)
        !createTestMatchTeam(eventId, TimingSystem.RACECLOCKER)

        val response = !TimingService.getTeams(eventId)
        val list = (response as ApiResponse.ListDto<TimingTeamDto>).data

        assertEquals(listOf(ownTeam), list.map { it.competitionMatchTeam })
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
}
