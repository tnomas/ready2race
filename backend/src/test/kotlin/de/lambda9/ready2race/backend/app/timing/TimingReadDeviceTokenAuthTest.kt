package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.timing.boundary.TIMING_DEVICE_TOKEN_HEADER
import de.lambda9.ready2race.backend.app.timing.boundary.TimingDeviceTokenService
import de.lambda9.ready2race.backend.app.timing.entity.TimingDeviceTokenRequest
import de.lambda9.ready2race.testing.testApplicationComprehension
import io.ktor.client.request.*
import io.ktor.http.*
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Routen-Abdeckung des Geräte-Token-Zweigs der Lese-Endpunkte: geteilte Posten-Links (Erfassung,
 * Startbildschirm) authentifizieren sich mit dem Geräte-Token aus dem Leitstand-Geräte-Reiter
 * statt mit einer Sitzung. Der Sitzungs-Weg bleibt unangetastet: ohne Token verlangen die
 * Endpunkte weiterhin eine Anmeldung.
 */
class TimingReadDeviceTokenAuthTest {

    @Test
    fun deviceTokenReadsStateStationsTeamsAndActiveSequence() = testApplicationComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)
        val issued = (!TimingDeviceTokenService.issue(
            eventId,
            TimingDeviceTokenRequest("Startbildschirm Steg", stationId),
            userId,
        )).dto

        for (path in listOf(
            "/api/event/$eventId/timing/state",
            "/api/event/$eventId/timing/stations",
            "/api/event/$eventId/timing/teams",
            "/api/event/$eventId/timing/sequences/active?stationId=$stationId",
        )) {
            val response = client.get(path) {
                header(TIMING_DEVICE_TOKEN_HEADER, issued.token)
            }
            assertEquals(HttpStatusCode.OK, response.status, "expected 200 for $path")
        }
    }

    @Test
    fun invalidDeviceTokenIsRejectedOnReads() = testApplicationComprehension {
        val (eventId, _) = !createTestEventWithAdmin()

        val response = client.get("/api/event/$eventId/timing/state") {
            header(TIMING_DEVICE_TOKEN_HEADER, "nope")
        }

        assertEquals(HttpStatusCode.Unauthorized, response.status)
    }

    @Test
    fun deviceTokenOfAnotherEventIsRejectedOnReads() = testApplicationComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val (otherEventId, _) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)
        val issued = (!TimingDeviceTokenService.issue(
            eventId,
            TimingDeviceTokenRequest("Startbildschirm Steg", stationId),
            userId,
        )).dto

        val response = client.get("/api/event/$otherEventId/timing/state") {
            header(TIMING_DEVICE_TOKEN_HEADER, issued.token)
        }

        assertEquals(HttpStatusCode.Unauthorized, response.status)
    }

    @Test
    fun withoutTokenReadsStillDemandASession() = testApplicationComprehension {
        val (eventId, _) = !createTestEventWithAdmin()

        val response = client.get("/api/event/$eventId/timing/state")

        assertEquals(HttpStatusCode.Unauthorized, response.status)
    }
}
