package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.timing.boundary.TIMING_DEVICE_TOKEN_HEADER
import de.lambda9.ready2race.backend.app.timing.boundary.TimingDeviceTokenService
import de.lambda9.ready2race.backend.app.timing.control.TimingStationRepo
import de.lambda9.ready2race.backend.app.timing.entity.TimingDeviceTokenRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationType
import de.lambda9.ready2race.testing.testApplicationComprehension
import de.lambda9.tailwind.core.extensions.kio.orDie
import io.ktor.client.request.*
import io.ktor.http.*
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Scharfschaltung per Geräte-Token: der Posten auf dem geteilten Gerät schaltet sich SELBST - mehr
 * nicht. Fremde Posten und ANZEIGE-Tokens bleiben verwehrt; jede Token-Ablehnung ist ein 401 ohne
 * Begründung.
 *
 * Warum eigene Fälle für diese Weiche: Entschärfen sperrt jede zugeordnete Erfassung. Ein Token,
 * das einen fremden Posten schalten könnte, wäre ein Ausschalter für die Ziellinie - und der
 * Anzeige-Link, der an Athleten- und Schiedsrichter-Bildschirmen hängt, wäre der Schalter dazu.
 */
class TimingArmedDeviceTokenAuthTest {

    @Test
    fun ownStationTokenArmsAndDisarms() = testApplicationComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val finishStation = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val issued = (!TimingDeviceTokenService.issue(
            eventId,
            TimingDeviceTokenRequest("Zielposten Handy", finishStation),
            userId,
        )).dto

        val arm = client.put("/api/event/$eventId/timing/stations/$finishStation/armed") {
            header(TIMING_DEVICE_TOKEN_HEADER, issued.token)
            contentType(ContentType.Application.Json)
            setBody("""{"armed":true}""")
        }
        assertEquals(HttpStatusCode.NoContent, arm.status)
        assertTrue((!TimingStationRepo.get(finishStation).orDie())!!.armed!!)

        val disarm = client.put("/api/event/$eventId/timing/stations/$finishStation/armed") {
            header(TIMING_DEVICE_TOKEN_HEADER, issued.token)
            contentType(ContentType.Application.Json)
            setBody("""{"armed":false}""")
        }
        assertEquals(HttpStatusCode.NoContent, disarm.status)
        assertFalse((!TimingStationRepo.get(finishStation).orDie())!!.armed!!)
    }

    @Test
    fun tokenOfAnotherStationMayNotSwitch() = testApplicationComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val finishStation = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val startStation = !addTestStation(eventId, userId, TimingStationType.START)
        !armDirectly(finishStation, eventId)
        val issued = (!TimingDeviceTokenService.issue(
            eventId,
            TimingDeviceTokenRequest("Startposten Handy", startStation),
            userId,
        )).dto

        // Der Startposten entschärft den Zielposten nicht - dieselbe Veranstaltung reicht nicht.
        val response = client.put("/api/event/$eventId/timing/stations/$finishStation/armed") {
            header(TIMING_DEVICE_TOKEN_HEADER, issued.token)
            contentType(ContentType.Application.Json)
            setBody("""{"armed":false}""")
        }

        assertEquals(HttpStatusCode.Unauthorized, response.status)
        assertTrue((!TimingStationRepo.get(finishStation).orDie())!!.armed!!)
    }

    @Test
    fun anzeigeTokenMayNotSwitch() = testApplicationComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val finishStation = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val displayStation = !addTestStation(eventId, userId, TimingStationType.ANZEIGE)
        !armDirectly(finishStation, eventId)
        val issued = (!TimingDeviceTokenService.issue(
            eventId,
            TimingDeviceTokenRequest("Startanzeige", displayStation),
            userId,
        )).dto

        // Nicht den fremden Zielposten ...
        val foreign = client.put("/api/event/$eventId/timing/stations/$finishStation/armed") {
            header(TIMING_DEVICE_TOKEN_HEADER, issued.token)
            contentType(ContentType.Application.Json)
            setBody("""{"armed":false}""")
        }
        assertEquals(HttpStatusCode.Unauthorized, foreign.status)
        assertTrue((!TimingStationRepo.get(finishStation).orDie())!!.armed!!)

        // ... und den eigenen erst recht nicht: eine Anzeige erfasst nie, sie hat nichts zu
        // schalten.
        val own = client.put("/api/event/$eventId/timing/stations/$displayStation/armed") {
            header(TIMING_DEVICE_TOKEN_HEADER, issued.token)
            contentType(ContentType.Application.Json)
            setBody("""{"armed":true}""")
        }
        assertEquals(HttpStatusCode.Unauthorized, own.status)
        assertFalse((!TimingStationRepo.get(displayStation).orDie())!!.armed!!)
    }

    @Test
    fun tokenOfAnotherEventMayNotSwitch() = testApplicationComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val (otherEventId, otherUserId) = !createTestEventWithAdmin()
        val finishStation = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val foreignStation = !addTestStation(otherEventId, otherUserId, TimingStationType.FINISH)
        !armDirectly(finishStation, eventId)
        val issued = (!TimingDeviceTokenService.issue(
            otherEventId,
            TimingDeviceTokenRequest("Fremde Regatta", foreignStation),
            otherUserId,
        )).dto

        val response = client.put("/api/event/$eventId/timing/stations/$finishStation/armed") {
            header(TIMING_DEVICE_TOKEN_HEADER, issued.token)
            contentType(ContentType.Application.Json)
            setBody("""{"armed":false}""")
        }

        assertEquals(HttpStatusCode.Unauthorized, response.status)
        assertTrue((!TimingStationRepo.get(finishStation).orDie())!!.armed!!)
    }

    @Test
    fun withoutTokenAndWithoutSessionNothingSwitches() = testApplicationComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val finishStation = !addTestStation(eventId, userId, TimingStationType.FINISH)
        !armDirectly(finishStation, eventId)

        val response = client.put("/api/event/$eventId/timing/stations/$finishStation/armed") {
            contentType(ContentType.Application.Json)
            setBody("""{"armed":false}""")
        }

        assertEquals(HttpStatusCode.Unauthorized, response.status)
        assertTrue((!TimingStationRepo.get(finishStation).orDie())!!.armed!!)
    }

    /**
     * Schaltet direkt über das Repo scharf - der Ausgangszustand der Ablehnungs-Fälle. Über den
     * Dienst zu gehen hieße, die zu prüfende Weiche als Vorbereitung zu benutzen.
     */
    private fun armDirectly(stationId: UUID, eventId: UUID) =
        TimingStationRepo.update(stationId) { armed = true }.orDie()
}
