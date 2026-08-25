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

        !TimingService.setStationArmed(stationId, eventId, armed = true)

        assertTrue((!singleStation(eventId)).armed)
    }

    @Test
    fun setStationArmedDisarmsAgain() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)

        !TimingService.setStationArmed(stationId, eventId, armed = true)
        !TimingService.setStationArmed(stationId, eventId, armed = false)

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
            TimingService.setStationArmed(stationFromOtherEvent, eventId, armed = true)
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
            !TimingService.setStationArmed(stationId, eventId, armed = true)

            runBlocking { TimingBroadcasterTest.awaitSize(received, 1) }
            assertTrue(received.single().contains("stationsChanged"), "erwartet stationsChanged: $received")
        } finally {
            TimingBroadcaster.unsubscribe(subscription)
        }
    }

    /**
     * Der wunde Punkt der Trennung: Ein Speichern der EINRICHTUNG (Umbenennen, Sortieren) darf
     * weder den scharfen Posten entschärfen noch seine Betriebsart zurückfallen lassen. Das
     * Formular kennt `captureMode` heute nicht und schickt es folglich nicht mit - genau dann
     * greift „null heißt unverändert".
     */
    @Test
    fun updateStationKeepsArmedStateAndCaptureMode() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)

        !TimingService.updateStation(
            TimingStationRequest(
                name = "Ziel",
                type = TimingStationType.FINISH,
                sorting = 0,
                captureMode = TimingCaptureMode.ARMED,
            ),
            userId,
            stationId,
            eventId,
        )
        !TimingService.setStationArmed(stationId, eventId, armed = true)

        // Ein reines Umbenennen - ohne captureMode, wie es die Posten-Maske heute schickt.
        !TimingService.updateStation(
            TimingStationRequest(name = "Ziellinie", type = TimingStationType.FINISH, sorting = 1),
            userId,
            stationId,
            eventId,
        )

        val station = !singleStation(eventId)
        assertEquals("Ziellinie", station.name)
        assertEquals(TimingCaptureMode.ARMED, station.captureMode)
        assertTrue(station.armed)
    }

    /**
     * Die Gegenrichtung zu [updateStationKeepsArmedStateAndCaptureMode] und der eigentliche Grund
     * der Trennung: Stellt die Leitung einen Posten auf ARMED, steht er danach entschärft da.
     *
     * Der Ablauf hier ist der erreichbare Weg zum stillen Selbst-Scharfschalten: ARMED, vor Ort
     * scharf, von der Leitung auf ONETOUCH (`armed` liegt brach) und später zurück auf ARMED. Ohne
     * die Regel wäre der Posten mit der Rückkehr sofort wieder scharf, ohne dass jemand am Wasser
     * gewesen wäre - und das Abzeichen im Leitstand meldete „scharf".
     */
    @Test
    fun switchingBackToArmedLeavesTheStationDisarmed() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)

        !TimingService.updateStation(
            stationRequest(TimingCaptureMode.ARMED),
            userId,
            stationId,
            eventId,
        )
        !TimingService.setStationArmed(stationId, eventId, armed = true)

        // Der Ausflug: im Onetouch-Betrieb hat die Scharfschaltung keine Wirkung mehr...
        !TimingService.updateStation(
            stationRequest(TimingCaptureMode.ONETOUCH),
            userId,
            stationId,
            eventId,
        )
        // ...und bei der Rückkehr darf sie nicht wieder auftauchen.
        !TimingService.updateStation(
            stationRequest(TimingCaptureMode.ARMED),
            userId,
            stationId,
            eventId,
        )

        val station = !singleStation(eventId)
        assertEquals(TimingCaptureMode.ARMED, station.captureMode)
        assertFalse(station.armed, "ein auf ARMED gestellter Posten muss vor Ort scharf geschaltet werden")
    }

    /**
     * Und die Kehrseite derselben Regel: Ein Speichern, das die Betriebsart bei ARMED BELÄSST,
     * entschärft nicht. Sonst nähme ein Umbenennen mitten im Lauf dem Zeitnehmer die Erfassung weg,
     * ohne dass jemand am Posten etwas gemerkt hätte.
     */
    @Test
    fun savingAgainWithUnchangedArmedModeKeepsTheStationArmed() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)

        !TimingService.updateStation(
            stationRequest(TimingCaptureMode.ARMED),
            userId,
            stationId,
            eventId,
        )
        !TimingService.setStationArmed(stationId, eventId, armed = true)

        !TimingService.updateStation(
            stationRequest(TimingCaptureMode.ARMED).copy(name = "Ziellinie"),
            userId,
            stationId,
            eventId,
        )

        val station = !singleStation(eventId)
        assertEquals("Ziellinie", station.name)
        assertTrue(station.armed)
    }

    private fun stationRequest(captureMode: TimingCaptureMode) = TimingStationRequest(
        name = "Ziel",
        type = TimingStationType.FINISH,
        sorting = 0,
        captureMode = captureMode,
    )

    private fun singleStation(eventId: java.util.UUID): App<ServiceError, TimingStationDto> =
        TimingService.getStations(eventId).map {
            (it as ApiResponse.ListDto<TimingStationDto>).data.single()
        }
}
