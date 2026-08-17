package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.timing.boundary.TimingService
import de.lambda9.ready2race.backend.app.timing.entity.*
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.testing.testComprehension
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class TimingStateTest {

    @Test
    fun stateContainsStationsAndMarksWithAssignments() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)
        val markId = UUID.randomUUID()
        !TimingService.createTimeMark(CreateTimeMarkRequest(markId, stationId, 1755430000000), userId, eventId)

        val state = !TimingService.getState(eventId)
        val dto = (state as ApiResponse.Dto<TimingStateDto>).dto

        assertEquals(1, dto.stations.size)
        assertEquals(stationId, dto.stations.first().id)

        assertEquals(1, dto.timeMarks.size)
        val mark = dto.timeMarks.first()
        assertEquals(markId, mark.id)
        assertNull(mark.assignedTeam)
        assertEquals("ACTIVE", mark.status)
    }

    @Test
    fun stateSortsMarksByTimestampAndPopulatesAssignedTeam() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)
        val teamId = !createTestMatchTeam(eventId)

        val laterMarkId = UUID.randomUUID()
        !TimingService.createTimeMark(CreateTimeMarkRequest(laterMarkId, stationId, 1755430002000), userId, eventId)
        val earlierMarkId = UUID.randomUUID()
        !TimingService.createTimeMark(CreateTimeMarkRequest(earlierMarkId, stationId, 1755430001000), userId, eventId)

        !TimingService.assignTimeMark(AssignTimeMarkRequest(teamId), userId, earlierMarkId, eventId)

        val state = !TimingService.getState(eventId)
        val dto = (state as ApiResponse.Dto<TimingStateDto>).dto

        assertEquals(2, dto.timeMarks.size)
        assertEquals(earlierMarkId, dto.timeMarks[0].id)
        assertEquals(laterMarkId, dto.timeMarks[1].id)
        assertEquals(teamId, dto.timeMarks[0].assignedTeam)
        assertNull(dto.timeMarks[1].assignedTeam)
    }

    @Test
    fun assignmentRoundTripUpsertsAndDetaches() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)
        val teamId = !createTestMatchTeam(eventId)
        val team2Id = !createTestMatchTeam(eventId)
        val markId = UUID.randomUUID()
        !TimingService.createTimeMark(CreateTimeMarkRequest(markId, stationId, 1755430000000), userId, eventId)

        !TimingService.assignTimeMark(AssignTimeMarkRequest(teamId), userId, markId, eventId)
        var state = (!TimingService.getState(eventId) as ApiResponse.Dto<TimingStateDto>).dto
        assertEquals(teamId, state.timeMarks.first { it.id == markId }.assignedTeam)

        // re-assign upsert
        !TimingService.assignTimeMark(AssignTimeMarkRequest(team2Id), userId, markId, eventId)
        state = (!TimingService.getState(eventId) as ApiResponse.Dto<TimingStateDto>).dto
        assertEquals(team2Id, state.timeMarks.first { it.id == markId }.assignedTeam)

        // detach
        !TimingService.assignTimeMark(AssignTimeMarkRequest(null), userId, markId, eventId)
        state = (!TimingService.getState(eventId) as ApiResponse.Dto<TimingStateDto>).dto
        assertNull(state.timeMarks.first { it.id == markId }.assignedTeam)
    }

    @Test
    fun retractedMarkStaysVisibleInStateWithRetractedStatus() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)
        val markId = UUID.randomUUID()
        !TimingService.createTimeMark(CreateTimeMarkRequest(markId, stationId, 1755430000000), userId, eventId)

        !TimingService.retractTimeMark(markId, eventId, userId)

        val state = !TimingService.getState(eventId)
        val dto = (state as ApiResponse.Dto<TimingStateDto>).dto

        assertEquals(1, dto.timeMarks.size)
        val mark = dto.timeMarks.first { it.id == markId }
        assertEquals("RETRACTED", mark.status)
    }

    @Test
    fun createTimeMarkFailsWhenStationBelongsToDifferentEvent() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val (otherEventId, otherUserId) = !createTestEventWithAdmin()
        val stationFromOtherEvent = !addTestStation(otherEventId, otherUserId)

        assertKIOFails(TimingError.EventMismatch) {
            TimingService.createTimeMark(
                CreateTimeMarkRequest(UUID.randomUUID(), stationFromOtherEvent, 1755430000000),
                userId,
                eventId,
            )
        }
    }
}
