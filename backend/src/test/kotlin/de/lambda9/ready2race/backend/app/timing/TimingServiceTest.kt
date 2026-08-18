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

    // The sorting of a SPLIT station becomes the `position` of the lap rows its marks write, and that
    // position is unique per boat: two split stations sorted alike would silently lose one of the
    // two laps. The collision is refused where it is still fixable.
    @Test
    fun addStationFailsOnDuplicateSplitSorting() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !TimingService.addStation(
            TimingStationRequest(name = "Runde 1", type = TimingStationType.SPLIT, sorting = 2),
            userId,
            eventId,
        )

        assertKIOFails(TimingError.StationSortingTaken) {
            TimingService.addStation(
                TimingStationRequest(name = "Runde 2", type = TimingStationType.SPLIT, sorting = 2),
                userId,
                eventId,
            )
        }
    }

    @Test
    fun updateStationFailsOnDuplicateSplitSorting() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !TimingService.addStation(
            TimingStationRequest(name = "Runde 1", type = TimingStationType.SPLIT, sorting = 2),
            userId,
            eventId,
        )
        val second = !TimingService.addStation(
            TimingStationRequest(name = "Runde 2", type = TimingStationType.SPLIT, sorting = 3),
            userId,
            eventId,
        )
        val secondId = (second as ApiResponse.Created).id

        assertKIOFails(TimingError.StationSortingTaken) {
            TimingService.updateStation(
                TimingStationRequest(name = "Runde 2", type = TimingStationType.SPLIT, sorting = 2),
                userId,
                secondId,
                eventId,
            )
        }

        // Keeping its own sorting is not a collision with itself.
        !TimingService.updateStation(
            TimingStationRequest(name = "Runde 2b", type = TimingStationType.SPLIT, sorting = 3),
            userId,
            secondId,
            eventId,
        )
    }

    // START and FINISH sortings only order the board columns and never become a lap position, so
    // they may repeat - including alongside a split station.
    @Test
    fun nonSplitStationsMayShareASorting() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !TimingService.addStation(
            TimingStationRequest(name = "Start", type = TimingStationType.START, sorting = 1),
            userId,
            eventId,
        )
        !TimingService.addStation(
            TimingStationRequest(name = "Ziel", type = TimingStationType.FINISH, sorting = 1),
            userId,
            eventId,
        )
        !TimingService.addStation(
            TimingStationRequest(name = "Runde 1", type = TimingStationType.SPLIT, sorting = 1),
            userId,
            eventId,
        )

        assertEquals(3, ((!TimingService.getStations(eventId)) as ApiResponse.ListDto<TimingStationDto>).data.size)
    }

    // A split sorting is only taken within its own event.
    @Test
    fun splitSortingIsScopedToTheEvent() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val (otherEventId, otherUserId) = !createTestEventWithAdmin()
        !TimingService.addStation(
            TimingStationRequest(name = "Runde 1", type = TimingStationType.SPLIT, sorting = 2),
            userId,
            eventId,
        )

        !TimingService.addStation(
            TimingStationRequest(name = "Runde 1", type = TimingStationType.SPLIT, sorting = 2),
            otherUserId,
            otherEventId,
        )
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
