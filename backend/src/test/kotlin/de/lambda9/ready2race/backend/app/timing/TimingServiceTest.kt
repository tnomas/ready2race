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
    fun deleteNonexistentStationFails() = testComprehension {
        val (eventId, _) = !createTestEventWithAdmin()

        assertKIOFails(TimingError.StationNotFound) {
            TimingService.deleteStation(java.util.UUID.randomUUID(), eventId)
        }
    }

    @Test
    fun addStationFailsOnDuplicateName() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !TimingService.addStation(
            TimingStationRequest(name = "Finish", type = TimingStationType.FINISH, sorting = 0),
            userId,
            eventId,
        )

        assertKIOFails(TimingError.StationNameTaken) {
            TimingService.addStation(
                TimingStationRequest(name = "Finish", type = TimingStationType.START, sorting = 1),
                userId,
                eventId,
            )
        }
    }

    @Test
    fun updateStationFailsOnDuplicateName() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !TimingService.addStation(
            TimingStationRequest(name = "Finish", type = TimingStationType.FINISH, sorting = 0),
            userId,
            eventId,
        )
        val startResponse = !TimingService.addStation(
            TimingStationRequest(name = "Start", type = TimingStationType.START, sorting = 1),
            userId,
            eventId,
        )
        val startId = (startResponse as ApiResponse.Created).id

        assertKIOFails(TimingError.StationNameTaken) {
            TimingService.updateStation(
                TimingStationRequest(name = "Finish", type = TimingStationType.START, sorting = 1),
                userId,
                startId,
                eventId,
            )
        }
    }

    @Test
    fun updateStationFailsWhenStationBelongsToDifferentEvent() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val (otherEventId, otherUserId) = !createTestEventWithAdmin()
        val stationFromOtherEvent = !addTestStation(otherEventId, otherUserId)

        assertKIOFails(TimingError.EventMismatch) {
            TimingService.updateStation(
                TimingStationRequest(name = "Finish", type = TimingStationType.FINISH, sorting = 0),
                userId,
                stationFromOtherEvent,
                eventId,
            )
        }
    }

    @Test
    fun deleteStationFailsWhenStationBelongsToDifferentEvent() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val (otherEventId, otherUserId) = !createTestEventWithAdmin()
        val stationFromOtherEvent = !addTestStation(otherEventId, otherUserId)

        assertKIOFails(TimingError.EventMismatch) {
            TimingService.deleteStation(stationFromOtherEvent, eventId)
        }
    }
}
