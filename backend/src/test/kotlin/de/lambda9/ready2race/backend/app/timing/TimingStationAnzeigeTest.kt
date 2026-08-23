package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.timing.boundary.TimingSequenceService
import de.lambda9.ready2race.backend.app.timing.boundary.TimingService
import de.lambda9.ready2race.backend.app.timing.entity.ActiveSequenceDto
import de.lambda9.ready2race.backend.app.timing.entity.CreateSequenceRequest
import de.lambda9.ready2race.backend.app.timing.entity.CreateTimeMarkRequest
import de.lambda9.ready2race.backend.app.timing.entity.SequenceMode
import de.lambda9.ready2race.backend.app.timing.entity.TimingError
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationType
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.testing.testComprehension
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

/**
 * Der neue Postentyp ANZEIGE: rein lesender Bildschirm-Posten. Die Verknüpfung (`linkedStation`)
 * darf nur an einer ANZEIGE hängen und nur auf einen START-Posten derselben Veranstaltung zeigen;
 * Marken auf ANZEIGE sind immer ein Fehler; die Sequenz-Abfrage spiegelt den verknüpften Posten
 * (oder ohne Verknüpfung die ganze Veranstaltung).
 */
class TimingStationAnzeigeTest {

    @Test
    fun anzeigeWithLinkedStartStationIsCreated() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val startStation = !addTestStation(eventId, userId, TimingStationType.START)

        val displayId = !addTestStation(eventId, userId, TimingStationType.ANZEIGE, linkedStation = startStation)

        val stations = (!TimingService.getStations(eventId) as ApiResponse.ListDto<*>).data
            .filterIsInstance<de.lambda9.ready2race.backend.app.timing.entity.TimingStationDto>()
        val display = stations.single { it.id == displayId }
        assertEquals(TimingStationType.ANZEIGE, display.type)
        assertEquals(startStation, display.linkedStation)
    }

    @Test
    fun linkedStationMustBeAStartStation() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val finishStation = !addTestStation(eventId, userId, TimingStationType.FINISH)

        assertKIOFails(TimingError.LinkedStationInvalid) {
            TimingService.addStation(
                TimingStationRequest("Anzeige", TimingStationType.ANZEIGE, 0, linkedStation = finishStation),
                userId,
                eventId,
            )
        }
    }

    @Test
    fun linkedStationOfAnotherEventIsRejected() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val (otherEventId, otherUserId) = !createTestEventWithAdmin()
        val foreignStart = !addTestStation(otherEventId, otherUserId, TimingStationType.START)

        assertKIOFails(TimingError.LinkedStationInvalid) {
            TimingService.addStation(
                TimingStationRequest("Anzeige", TimingStationType.ANZEIGE, 0, linkedStation = foreignStart),
                userId,
                eventId,
            )
        }
    }

    @Test
    fun onlyAnzeigeStationsMayCarryALink() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val startStation = !addTestStation(eventId, userId, TimingStationType.START)

        assertKIOFails(TimingError.LinkedStationInvalid) {
            TimingService.addStation(
                TimingStationRequest("Ziel", TimingStationType.FINISH, 0, linkedStation = startStation),
                userId,
                eventId,
            )
        }
    }

    @Test
    fun timeMarksOnAnzeigeAreRejected() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val displayId = !addTestStation(eventId, userId, TimingStationType.ANZEIGE)

        assertKIOFails(TimingError.StationNotCapturing) {
            TimingService.createTimeMark(
                CreateTimeMarkRequest(UUID.randomUUID(), displayId, 1_000L),
                userId,
                eventId,
            )
        }
    }

    @Test
    fun mirroredStartStationCannotChangeItsType() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val startStation = !addTestStation(eventId, userId, TimingStationType.START)
        !addTestStation(eventId, userId, TimingStationType.ANZEIGE, linkedStation = startStation)

        assertKIOFails(TimingError.LinkedStationInvalid) {
            TimingService.updateStation(
                TimingStationRequest("Umgewidmet", TimingStationType.FINISH, 0),
                userId,
                startStation,
                eventId,
            )
        }
    }

    @Test
    fun linkedAnzeigeMirrorsTheSequenceOfItsStartStation() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val fixture = !createTestMatchFixture(eventId)
        val startA = !addTestStation(eventId, userId, TimingStationType.START)
        val startB = !addTestStation(eventId, userId, TimingStationType.START)
        val display = !addTestStation(eventId, userId, TimingStationType.ANZEIGE, linkedStation = startA)

        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(startA, SequenceMode.MASS, null, fixture.teamIds),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id

        val mirrored = (!TimingSequenceService.getActiveSequence(eventId, display) as ApiResponse.Dto<*>).dto
            .let { it as ActiveSequenceDto }
        assertEquals(sequenceId, mirrored.sequence?.id)

        // Eine Anzeige, die startB spiegelte, sähe nichts - die Sequenz gehört startA.
        val other = !addTestStation(eventId, userId, TimingStationType.ANZEIGE, linkedStation = startB)
        val empty = (!TimingSequenceService.getActiveSequence(eventId, other) as ApiResponse.Dto<*>).dto
            .let { it as ActiveSequenceDto }
        assertNull(empty.sequence)
    }

    @Test
    fun unlinkedAnzeigeSeesAnyActiveSequenceOfTheEvent() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val fixture = !createTestMatchFixture(eventId)
        val startStation = !addTestStation(eventId, userId, TimingStationType.START)
        val display = !addTestStation(eventId, userId, TimingStationType.ANZEIGE)

        !TimingSequenceService.createSequence(
            CreateSequenceRequest(startStation, SequenceMode.MASS, null, fixture.teamIds),
            userId,
            eventId,
        )

        val mirrored = (!TimingSequenceService.getActiveSequence(eventId, display) as ApiResponse.Dto<*>).dto
            .let { it as ActiveSequenceDto }
        assertNotNull(mirrored.sequence)
        assertEquals(startStation, mirrored.sequence?.station)
    }
}
