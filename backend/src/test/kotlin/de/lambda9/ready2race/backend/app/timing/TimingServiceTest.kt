package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.ServiceError
import de.lambda9.ready2race.backend.app.timing.boundary.TimingBroadcaster
import de.lambda9.ready2race.backend.app.timing.boundary.TimingService
import de.lambda9.ready2race.backend.app.timing.entity.TimingCaptureMode
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationType
import de.lambda9.ready2race.backend.app.timing.entity.TimingError
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationDto
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.testing.testComprehension
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

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

    /**
     * Die Vorgabe ist die Sicherung, nicht die Bequemlichkeit: Ein frisch angelegter Posten erfasst
     * bei jedem Druck (das heutige Verhalten) und ist NICHT scharf - ein Posten, der sich still
     * selbst scharf schaltete, wäre genau das, was die Scharfschaltung verhindern soll.
     */
    @Test
    fun newStationDefaultsToOnetouchAndDisarmed() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !addTestStation(eventId, userId)

        val station = !singleStation(eventId)
        assertEquals(TimingCaptureMode.ONETOUCH, station.captureMode)
        assertFalse(station.armed)
    }

    @Test
    fun setStationArmedArmsTheStation() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)

        !TimingService.setStationArmed(stationId, eventId, armed = true, userId = userId)

        assertTrue((!singleStation(eventId)).armed)
    }

    @Test
    fun setStationArmedDisarmsAgain() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)

        !TimingService.setStationArmed(stationId, eventId, armed = true, userId = userId)
        !TimingService.setStationArmed(stationId, eventId, armed = false, userId = userId)

        assertFalse((!singleStation(eventId)).armed)
    }

    /**
     * Der Weg trägt ein Geräte-Token statt einer Anmeldung - die Veranstaltung aus dem Pfad ist
     * damit die einzige Grenze, die den Posten einer fremden Regatta fernhält. Deshalb prüft
     * setStationArmed die Zugehörigkeit wie updateStation und deleteStation.
     */
    @Test
    fun setStationArmedFailsWhenStationBelongsToDifferentEvent() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val (otherEventId, otherUserId) = !createTestEventWithAdmin()
        val stationFromOtherEvent = !addTestStation(otherEventId, otherUserId)

        assertKIOFails(TimingError.EventMismatch) {
            TimingService.setStationArmed(stationFromOtherEvent, eventId, armed = true, userId = userId)
        }
    }

    /**
     * Der Leitstand und die übrigen Bildschirme erfahren die Scharfschaltung über denselben Weg wie
     * jede andere Änderung an den Posten - ohne die Nachricht bliebe eine offene Postenliste auf
     * dem alten Zustand stehen.
     */
    @Test
    fun setStationArmedBroadcastsStationsChanged() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)
        val received = TimingBroadcasterTest.concurrentList()
        val subscription = TimingBroadcaster.subscribe(eventId) { received.add(it) }

        try {
            !TimingService.setStationArmed(stationId, eventId, armed = true, userId = userId)

            runBlocking { TimingBroadcasterTest.awaitSize(received, 1) }
            assertTrue(received.single().contains("stationsChanged"), "erwartet stationsChanged: $received")
        } finally {
            TimingBroadcaster.unsubscribe(subscription)
        }
    }

    private fun singleStation(eventId: java.util.UUID): App<ServiceError, TimingStationDto> =
        TimingService.getStations(eventId).map {
            (it as ApiResponse.ListDto<TimingStationDto>).data.single()
        }
}
