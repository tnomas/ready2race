package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.timing.boundary.TimingService
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationType
import de.lambda9.ready2race.backend.app.timing.entity.TimingError
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationDto
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.testing.testComprehension
import kotlin.test.Test
import kotlin.test.assertEquals

class TimingServiceTest {

    @Test
    fun addAndListStations() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()

        !TimingService.addStation(
            TimingStationRequest(name = "Finish", type = TimingStationType.FINISH, sorting = 0),
            userId,
            eventId,
        )

        val stations = !TimingService.getStations(eventId)
        val list = (stations as ApiResponse.ListDto<TimingStationDto>).data

        assertEquals(1, list.size)
        val station = list.first()
        assertEquals("Finish", station.name)
        assertEquals(TimingStationType.FINISH, station.type)
    }

    @Test
    fun deleteStationWithMarksFails() = testComprehension {
        // add station, capture a time mark on it (TimingService.createTimeMark, Task 6 —
        // for this task, assert only StationNotFound on deleting a random UUID:)
        assertKIOFails(TimingError.StationNotFound) {
            TimingService.deleteStation(java.util.UUID.randomUUID())
        }
    }
}
