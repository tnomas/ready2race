package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.timing.boundary.TIMING_DEVICE_TOKEN_HEADER
import de.lambda9.ready2race.backend.app.timing.boundary.TimingDeviceTokenService
import de.lambda9.ready2race.backend.app.timing.boundary.TimingService
import de.lambda9.ready2race.backend.app.timing.control.TimingAssignmentRepo
import de.lambda9.ready2race.backend.app.timing.entity.CreateTimeMarkRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingDeviceTokenRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationType
import de.lambda9.tailwind.core.extensions.kio.orDie
import de.lambda9.ready2race.testing.testApplicationComprehension
import io.ktor.client.request.*
import io.ktor.http.*
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * Klick-Zuordnung per Geräte-Token: der Zielposten auf dem geteilten Gerät darf Marken seines
 * EIGENEN Postens zuordnen und umhängen - mehr nicht. Fremde Posten, ANZEIGE-Tokens und die
 * Rücknahme bleiben verwehrt; jede Token-Ablehnung ist ein 401 ohne Begründung.
 */
class TimingAssignDeviceTokenAuthTest {

    @Test
    fun ownStationTokenAssignsAndReassigns() = testApplicationComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val finishStation = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val teams = !createTestMatchTeams(eventId, 2)
        val markId = UUID.randomUUID()
        !TimingService.createTimeMark(CreateTimeMarkRequest(markId, finishStation, 61_000L), userId, eventId)
        val issued = (!TimingDeviceTokenService.issue(
            eventId,
            TimingDeviceTokenRequest("Zielposten Handy", finishStation),
            userId,
        )).dto

        // Zuordnen ...
        val assign = client.put("/api/event/$eventId/timing/timeMarks/$markId/assignment") {
            header(TIMING_DEVICE_TOKEN_HEADER, issued.token)
            contentType(ContentType.Application.Json)
            setBody("""{"competitionMatchTeam":"${teams[0]}"}""")
        }
        assertEquals(HttpStatusCode.NoContent, assign.status)

        // ... und Umhängen aufs andere Boot (Verklicken ist der Normalfall).
        val reassign = client.put("/api/event/$eventId/timing/timeMarks/$markId/assignment") {
            header(TIMING_DEVICE_TOKEN_HEADER, issued.token)
            contentType(ContentType.Application.Json)
            setBody("""{"competitionMatchTeam":"${teams[1]}"}""")
        }
        assertEquals(HttpStatusCode.NoContent, reassign.status)

        val assignment = !TimingAssignmentRepo.getByTimeMark(markId).orDie()
        assertEquals(teams[1], assignment?.competitionMatchTeam)
        // Revisionsspur: das Gerät ist der Akteur, kein app_user.
        assertEquals(issued.deviceToken.id, assignment?.updatedByDevice)
        assertNull(assignment?.updatedBy)
    }

    @Test
    fun tokenOfAnotherStationMayNotTouchTheMark() = testApplicationComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val finishStation = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val startStation = !addTestStation(eventId, userId, TimingStationType.START)
        val team = !createTestMatchTeam(eventId)
        val markId = UUID.randomUUID()
        !TimingService.createTimeMark(CreateTimeMarkRequest(markId, finishStation, 61_000L), userId, eventId)
        val issued = (!TimingDeviceTokenService.issue(
            eventId,
            TimingDeviceTokenRequest("Startposten Handy", startStation),
            userId,
        )).dto

        val response = client.put("/api/event/$eventId/timing/timeMarks/$markId/assignment") {
            header(TIMING_DEVICE_TOKEN_HEADER, issued.token)
            contentType(ContentType.Application.Json)
            setBody("""{"competitionMatchTeam":"$team"}""")
        }

        assertEquals(HttpStatusCode.Unauthorized, response.status)
    }

    @Test
    fun anzeigeTokenIsReadOnly() = testApplicationComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val finishStation = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val displayStation = !addTestStation(eventId, userId, TimingStationType.ANZEIGE)
        val team = !createTestMatchTeam(eventId)
        val markId = UUID.randomUUID()
        !TimingService.createTimeMark(CreateTimeMarkRequest(markId, finishStation, 61_000L), userId, eventId)
        val issued = (!TimingDeviceTokenService.issue(
            eventId,
            TimingDeviceTokenRequest("Startanzeige", displayStation),
            userId,
        )).dto

        // Lesen geht - dafür ist die Anzeige da (Startliste eingeschlossen).
        for (path in listOf(
            "/api/event/$eventId/timing/state",
            "/api/event/$eventId/timing/matches",
            "/api/event/$eventId/timing/sequences/active?stationId=$displayStation",
        )) {
            val read = client.get(path) { header(TIMING_DEVICE_TOKEN_HEADER, issued.token) }
            assertEquals(HttpStatusCode.OK, read.status, "expected 200 for $path")
        }

        // Zuordnen nicht - auch nicht für Marken fremder Posten.
        val assign = client.put("/api/event/$eventId/timing/timeMarks/$markId/assignment") {
            header(TIMING_DEVICE_TOKEN_HEADER, issued.token)
            contentType(ContentType.Application.Json)
            setBody("""{"competitionMatchTeam":"$team"}""")
        }
        assertEquals(HttpStatusCode.Unauthorized, assign.status)

        // Und Marken auf dem eigenen (ANZEIGE-)Posten stempeln erst recht nicht.
        val capture = client.post("/api/event/$eventId/timing/timeMarks") {
            header(TIMING_DEVICE_TOKEN_HEADER, issued.token)
            contentType(ContentType.Application.Json)
            setBody("""{"id":"${UUID.randomUUID()}","station":"$displayStation","timestampMillis":1000}""")
        }
        assertEquals(HttpStatusCode.BadRequest, capture.status)
    }

    @Test
    fun retractionStaysASessionAffair() = testApplicationComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val finishStation = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val markId = UUID.randomUUID()
        !TimingService.createTimeMark(CreateTimeMarkRequest(markId, finishStation, 61_000L), userId, eventId)
        val issued = (!TimingDeviceTokenService.issue(
            eventId,
            TimingDeviceTokenRequest("Zielposten Handy", finishStation),
            userId,
        )).dto

        val response = client.put("/api/event/$eventId/timing/timeMarks/$markId/retract") {
            header(TIMING_DEVICE_TOKEN_HEADER, issued.token)
        }

        assertEquals(HttpStatusCode.Unauthorized, response.status)
    }
}
