package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.eventInfo.boundary.BoardService
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardConfig
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardElement
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardElementType
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardRequest
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardTile
import de.lambda9.ready2race.backend.app.timing.boundary.TIMING_DEVICE_TOKEN_HEADER
import de.lambda9.ready2race.backend.app.timing.boundary.TimingDeviceTokenService
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationType
import de.lambda9.ready2race.backend.database.generated.tables.references.APP_USER_SESSION
import de.lambda9.ready2race.backend.plugins.TIMING_WS_SUBPROTOCOL
import de.lambda9.ready2race.testing.testApplicationComprehension
import de.lambda9.tailwind.jooq.Jooq
import io.ktor.client.HttpClient
import io.ktor.client.plugins.websocket.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.ClientProvider
import io.ktor.websocket.*
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.withTimeout
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import kotlin.time.Duration.Companion.seconds

/**
 * Route level coverage for `GET /api/ws/event/{eventId}/timing`. The broadcast assertions also
 * cover the after-commit flush in `respondKIO`: the websocket message is only emitted once the
 * REST mutation that triggered it has been committed.
 */
class TimingSocketTest {

    // NOTE: must not be named `timeout` - DefaultWebSocketSession has a `timeout` member that would
    // shadow it inside the session extensions below.
    private val awaitTimeout = 10.seconds

    @Test
    fun handshakeWithoutSessionTokenIsRejected() = testApplicationComprehension {
        val (eventId, _) = !createTestEventWithAdmin()
        val wsClient = createClient { install(WebSockets) }

        // Neither an X-Api-Session header nor the "r2r" subprotocol: the session must be closed.
        val session = wsClient.webSocketSession("/api/ws/event/$eventId/timing")
        val closeReason = withTimeout(awaitTimeout) { session.closeReason.await() }

        assertNotNull(closeReason)
        assertEquals(CloseReason.Codes.VIOLATED_POLICY.code, closeReason.code)
    }

    @Test
    fun handshakeWithInvalidSubprotocolTokenIsRejected() = testApplicationComprehension {
        val (eventId, _) = !createTestEventWithAdmin()
        val wsClient = createClient { install(WebSockets) }

        val session = wsClient.timingSocketSession(eventId, "notAValidSessionToken")
        val closeReason = withTimeout(awaitTimeout) { session.closeReason.await() }

        assertNotNull(closeReason)
        assertEquals(CloseReason.Codes.VIOLATED_POLICY.code, closeReason.code)
    }

    @Test
    fun timeMarkCreatedIsBroadcastToSubprotocolAuthenticatedClient() = testApplicationComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)

        val sessionHeader = loginAsAdmin()
        val token = !Jooq.query { selectFrom(APP_USER_SESSION).fetchOne(APP_USER_SESSION.TOKEN) }
        assertNotNull(token)

        val wsClient = createClient { install(WebSockets) }
        val session = wsClient.timingSocketSession(eventId, token)
        try {
            val markId = UUID.randomUUID()
            val response = client.post("/api/event/$eventId/timing/timeMarks") {
                header(SESSION_HEADER, sessionHeader)
                contentType(ContentType.Application.Json)
                setBody("""{"id":"$markId","station":"$stationId","timestampMillis":${System.currentTimeMillis()}}""")
            }
            assertEquals(HttpStatusCode.Created, response.status)

            val json = session.receiveText()
            assertTrue(json.contains("\"type\":\"timeMarkCreated\""), "unexpected payload: $json")
            assertTrue(json.contains(markId.toString()), "unexpected payload: $json")
        } finally {
            session.close()
        }
    }

    @Test
    fun retractIsBroadcastToHeaderAuthenticatedClient() = testApplicationComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)
        val sessionHeader = loginAsAdmin()

        val markId = UUID.randomUUID()
        val created = client.post("/api/event/$eventId/timing/timeMarks") {
            header(SESSION_HEADER, sessionHeader)
            contentType(ContentType.Application.Json)
            setBody("""{"id":"$markId","station":"$stationId","timestampMillis":${System.currentTimeMillis()}}""")
        }
        assertEquals(HttpStatusCode.Created, created.status)

        // Non-browser clients can keep authenticating with the session header instead.
        val wsClient = createClient { install(WebSockets) }
        val session = wsClient.webSocketSession("/api/ws/event/$eventId/timing") {
            header(SESSION_HEADER, sessionHeader)
        }
        try {
            val response = client.put("/api/event/$eventId/timing/timeMarks/$markId/retract") {
                header(SESSION_HEADER, sessionHeader)
            }
            assertEquals(HttpStatusCode.NoContent, response.status)

            val json = session.receiveText()
            assertTrue(json.contains("\"type\":\"timeMarkRetracted\""), "unexpected payload: $json")
            assertTrue(json.contains(markId.toString()), "unexpected payload: $json")
        } finally {
            session.close()
        }
    }

    @Test
    fun concurrentDuplicateCreateBroadcastsOnlyOnce() = testApplicationComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)
        val sessionHeader = loginAsAdmin()
        val token = !Jooq.query { selectFrom(APP_USER_SESSION).fetchOne(APP_USER_SESSION.TOKEN) }
        assertNotNull(token)

        val wsClient = createClient { install(WebSockets) }
        val session = wsClient.timingSocketSession(eventId, token)
        try {
            // Both requests use the same client-generated id: whichever request loses - either on
            // the `exists` fast path or on INSERT ... ON CONFLICT DO NOTHING - must stay silent.
            val markId = UUID.randomUUID()
            val responses = coroutineScope {
                List(2) {
                    async {
                        client.post("/api/event/$eventId/timing/timeMarks") {
                            header(SESSION_HEADER, sessionHeader)
                            contentType(ContentType.Application.Json)
                            setBody("""{"id":"$markId","station":"$stationId","timestampMillis":${System.currentTimeMillis()}}""")
                        }
                    }
                }.awaitAll()
            }
            responses.forEach { assertEquals(HttpStatusCode.Created, it.status) }

            val json = session.receiveText()
            assertTrue(json.contains("\"type\":\"timeMarkCreated\""), "unexpected payload: $json")

            delay(500)
            assertTrue(session.incoming.isEmpty, "the losing request must not broadcast a second event")
        } finally {
            session.close()
        }
    }

    // --- Geräte-Token im Token-Slot des Subprotokolls ---------------------------------------
    //
    // Geteilte Posten-Links laufen ohne Anmeldung; ihr Geräte-Token reist in demselben Slot wie
    // sonst der Sitzungstoken (`new WebSocket(url, ["r2r", token])`). Die Tür ist dieselbe wie
    // bei den Lese-Endpunkten: `validateForEvent` - Posten-Tokens der Veranstaltung ja, ein
    // Board-Token nie.

    @Test
    fun handshakeWithStationDeviceTokenReceivesBroadcasts() = testApplicationComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)
        val link = (!TimingDeviceTokenService.shareLink(eventId, stationId, userId)).dto
        val sessionHeader = loginAsAdmin()

        val wsClient = createClient { install(WebSockets) }
        val session = wsClient.timingSocketSession(eventId, link.token)
        try {
            val markId = UUID.randomUUID()
            val response = client.post("/api/event/$eventId/timing/timeMarks") {
                header(SESSION_HEADER, sessionHeader)
                contentType(ContentType.Application.Json)
                setBody("""{"id":"$markId","station":"$stationId","timestampMillis":${System.currentTimeMillis()}}""")
            }
            assertEquals(HttpStatusCode.Created, response.status)

            val json = session.receiveText()
            assertTrue(json.contains("\"type\":\"timeMarkCreated\""), "unexpected payload: $json")
            assertTrue(json.contains(markId.toString()), "unexpected payload: $json")
        } finally {
            session.close()
        }
    }

    @Test
    fun handshakeWithBoardTokenIsRejected() = testApplicationComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val boardId = (!BoardService.createBoard(
            eventId,
            BoardRequest(
                name = "Anzeige Steg",
                config = BoardConfig(
                    columns = 1,
                    tiles = listOf(BoardTile(elements = listOf(BoardElement(type = BoardElementType.CLOCK)))),
                ),
            ),
        )).dto.id
        val board = (!TimingDeviceTokenService.shareLinkForBoard(eventId, boardId, userId)).dto

        // Ein Board-Token gehört derselben Veranstaltung und ist gültig - und öffnet den
        // Zeitnahme-Kanal trotzdem nicht: es ist auf seine Anzeige zugeschnitten.
        val wsClient = createClient { install(WebSockets) }
        val session = wsClient.timingSocketSession(eventId, board.token)
        val closeReason = withTimeout(awaitTimeout) { session.closeReason.await() }

        assertNotNull(closeReason)
        assertEquals(CloseReason.Codes.VIOLATED_POLICY.code, closeReason.code)
    }

    @Test
    fun handshakeWithAnzeigeTokenListensButCannotWrite() = testApplicationComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val finishId = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val displayId = !addTestStation(eventId, userId, TimingStationType.ANZEIGE)
        val display = (!TimingDeviceTokenService.shareLink(eventId, displayId, userId)).dto
        val sessionHeader = loginAsAdmin()

        val wsClient = createClient { install(WebSockets) }
        val session = wsClient.timingSocketSession(eventId, display.token)
        try {
            // Der Kanal ist reine Ausgabe: was ein Client sendet, wird verworfen und schließt
            // die Verbindung nicht.
            session.send(Frame.Text("""{"type":"timeMarkCreated"}"""))

            // Schreiben darf das ANZEIGE-Token auch über HTTP nicht: eine Anzeige misst nichts,
            // Marken auf ihr sind immer ein Fehler (StationNotCapturing, 400) ...
            val fromDisplay = client.post("/api/event/$eventId/timing/timeMarks") {
                header(TIMING_DEVICE_TOKEN_HEADER, display.token)
                contentType(ContentType.Application.Json)
                setBody("""{"id":"${UUID.randomUUID()}","station":"$displayId","timestampMillis":${System.currentTimeMillis()}}""")
            }
            assertEquals(HttpStatusCode.BadRequest, fromDisplay.status, fromDisplay.bodyAsText())

            // ... aber mithören, was am Zielposten passiert.
            val markId = UUID.randomUUID()
            val response = client.post("/api/event/$eventId/timing/timeMarks") {
                header(SESSION_HEADER, sessionHeader)
                contentType(ContentType.Application.Json)
                setBody("""{"id":"$markId","station":"$finishId","timestampMillis":${System.currentTimeMillis()}}""")
            }
            assertEquals(HttpStatusCode.Created, response.status)

            val json = session.receiveText()
            assertTrue(json.contains("\"type\":\"timeMarkCreated\""), "unexpected payload: $json")
            assertTrue(json.contains(markId.toString()), "unexpected payload: $json")
        } finally {
            session.close()
        }
    }

    private suspend fun ClientProvider.loginAsAdmin(): String {
        val login = client.post("/api/login") {
            contentType(ContentType.Application.Json)
            setBody("""{"email":"admin","password":"admin"}""")
        }
        assertEquals(HttpStatusCode.OK, login.status)
        return login.headers[SESSION_HEADER] ?: error("login did not return a $SESSION_HEADER header")
    }

    /** Mirrors `new WebSocket(url, ["r2r", token])` in the browser. */
    private suspend fun HttpClient.timingSocketSession(
        eventId: UUID,
        token: String,
    ): DefaultClientWebSocketSession =
        webSocketSession("/api/ws/event/$eventId/timing") {
            header(HttpHeaders.SecWebSocketProtocol, "$TIMING_WS_SUBPROTOCOL, $token")
        }

    private suspend fun DefaultClientWebSocketSession.receiveText(): String =
        withTimeout(awaitTimeout) { (incoming.receive() as Frame.Text).readText() }

    companion object {
        private const val SESSION_HEADER = "X-Api-Session"
    }
}
