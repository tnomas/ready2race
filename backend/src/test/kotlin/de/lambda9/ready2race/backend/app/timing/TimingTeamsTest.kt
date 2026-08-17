package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.timing.boundary.TimingService
import de.lambda9.ready2race.backend.app.timing.entity.TimingTeamDto
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
        assertEquals(teamId, list.first().competitionMatchTeam)
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
