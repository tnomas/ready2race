package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.timing.boundary.TIMING_DEVICE_TOKEN_HEADER
import de.lambda9.ready2race.backend.app.timing.boundary.TimingDeviceTokenService
import de.lambda9.ready2race.backend.app.timing.control.TimingTimeMarkRepo
import de.lambda9.ready2race.backend.app.timing.entity.TimingDeviceTokenRequest
import de.lambda9.ready2race.testing.testApplicationComprehension
import io.ktor.client.request.*
import io.ktor.http.*
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

/**
 * Route level coverage of the hardware-token branch of `POST /api/event/{eventId}/timing/timeMarks`.
 * The session path is asserted to be untouched: without a token header the endpoint still demands a
 * session.
 */
class TimeMarkHardwareAuthTest {

    @Test
    fun deviceTokenCapturesMarkAsHardware() = testApplicationComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)
        val issued = (!TimingDeviceTokenService.issue(
            eventId,
            TimingDeviceTokenRequest("Finish beam", stationId),
            userId,
        )).dto

        val markId = UUID.randomUUID()
        val response = client.post("/api/event/$eventId/timing/timeMarks") {
            header(TIMING_DEVICE_TOKEN_HEADER, issued.token)
            contentType(ContentType.Application.Json)
            setBody("""{"id":"$markId","station":"$stationId","timestampMillis":1755430000000}""")
        }

        assertEquals(HttpStatusCode.Created, response.status)
        val mark = !TimingTimeMarkRepo.get(markId)
        assertNotNull(mark)
        assertEquals("HARDWARE", mark.source)
        assertNull(mark.createdBy)
    }

    @Test
    fun invalidDeviceTokenIsRejected() = testApplicationComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)

        val response = client.post("/api/event/$eventId/timing/timeMarks") {
            header(TIMING_DEVICE_TOKEN_HEADER, "nope")
            contentType(ContentType.Application.Json)
            setBody("""{"id":"${UUID.randomUUID()}","station":"$stationId","timestampMillis":1755430000000}""")
        }

        assertEquals(HttpStatusCode.Unauthorized, response.status)
    }

    @Test
    fun deviceTokenCannotCaptureForAnotherStation() = testApplicationComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)
        val otherStationId = !addTestStation(eventId, userId)
        val issued = (!TimingDeviceTokenService.issue(
            eventId,
            TimingDeviceTokenRequest("Finish beam", stationId),
            userId,
        )).dto

        val markId = UUID.randomUUID()
        val response = client.post("/api/event/$eventId/timing/timeMarks") {
            header(TIMING_DEVICE_TOKEN_HEADER, issued.token)
            contentType(ContentType.Application.Json)
            setBody("""{"id":"$markId","station":"$otherStationId","timestampMillis":1755430000000}""")
        }

        assertEquals(HttpStatusCode.Unauthorized, response.status)
        assertNull(!TimingTimeMarkRepo.get(markId))
    }

    @Test
    fun revokedDeviceTokenIsRejected() = testApplicationComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)
        val issued = (!TimingDeviceTokenService.issue(
            eventId,
            TimingDeviceTokenRequest("Finish beam", stationId),
            userId,
        )).dto
        !TimingDeviceTokenService.revoke(eventId, issued.deviceToken.id)

        val response = client.post("/api/event/$eventId/timing/timeMarks") {
            header(TIMING_DEVICE_TOKEN_HEADER, issued.token)
            contentType(ContentType.Application.Json)
            setBody("""{"id":"${UUID.randomUUID()}","station":"$stationId","timestampMillis":1755430000000}""")
        }

        assertEquals(HttpStatusCode.Unauthorized, response.status)
    }

    @Test
    fun withoutTokenOrSessionTheEndpointStillDemandsASession() = testApplicationComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)

        val response = client.post("/api/event/$eventId/timing/timeMarks") {
            contentType(ContentType.Application.Json)
            setBody("""{"id":"${UUID.randomUUID()}","station":"$stationId","timestampMillis":1755430000000}""")
        }

        assertEquals(HttpStatusCode.Unauthorized, response.status)
    }
}
