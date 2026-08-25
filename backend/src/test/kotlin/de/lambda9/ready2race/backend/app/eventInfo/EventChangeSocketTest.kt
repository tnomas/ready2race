package de.lambda9.ready2race.backend.app.eventInfo

import de.lambda9.ready2race.backend.app.timing.createTestEventWithAdmin
import de.lambda9.ready2race.testing.testApplicationComprehension
import io.ktor.client.plugins.websocket.*
import io.ktor.client.request.*
import io.ktor.http.*
import io.ktor.server.testing.ClientProvider
import io.ktor.websocket.*
import kotlinx.coroutines.withTimeout
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import kotlin.time.Duration.Companion.seconds

/**
 * Routen-Abdeckung für `GET /api/ws/event/{eventId}/info` — den öffentlichen
 * Veranstaltungs-Kanal der Anzeigen. Der Push-Test deckt zugleich den After-Commit-Weg in
 * `EventChangeMarker.bump` ab: die Nachricht kommt erst, wenn die auslösende REST-Mutation
 * committed ist.
 */
class EventChangeSocketTest {

    // NOTE: nicht `timeout` nennen — DefaultWebSocketSession hat ein gleichnamiges Member.
    private val awaitTimeout = 10.seconds

    @Test
    fun handshakeWithInvalidEventIdIsRejected() = testApplicationComprehension {
        val wsClient = createClient { install(WebSockets) }

        val session = wsClient.webSocketSession("/api/ws/event/not-a-uuid/info")
        val closeReason = withTimeout(awaitTimeout) { session.closeReason.await() }

        assertNotNull(closeReason)
        assertEquals(CloseReason.Codes.CANNOT_ACCEPT.code, closeReason.code)
    }

    @Test
    fun connectWithoutAnyAuthReceivesTheCurrentMarkerImmediately() = testApplicationComprehension {
        // Öffentlich wie die Anzeige-Endpunkte unter /event/{eventId}/info: kein Token, keine
        // Sitzung — die Verbindung steht trotzdem und liefert sofort den Stand.
        val eventId = UUID.randomUUID()
        val wsClient = createClient { install(WebSockets) }

        val session = wsClient.webSocketSession("/api/ws/event/$eventId/info")
        try {
            val json = session.receiveText()
            assertEquals("""{"type":"changed","marker":0}""", json)
        } finally {
            session.close()
        }
    }

    @Test
    fun noticeUpdateIsPushedAfterCommit() = testApplicationComprehension {
        val (eventId, _) = !createTestEventWithAdmin()
        val sessionHeader = loginAsAdmin()

        val wsClient = createClient { install(WebSockets) }
        val session = wsClient.webSocketSession("/api/ws/event/$eventId/info")
        try {
            // Erst den Begrüßungs-Stand konsumieren, damit unten wirklich der Push gemessen wird.
            val initial = session.receiveText()
            assertTrue(initial.startsWith("""{"type":"changed","marker":"""), "unexpected: $initial")

            val response = client.put("/api/event/$eventId/notice") {
                header(SESSION_HEADER, sessionHeader)
                contentType(ContentType.Application.Json)
                setBody("""{"text":"Startverschiebung","severity":"INFO"}""")
            }
            assertEquals(HttpStatusCode.NoContent, response.status)

            val pushed = session.receiveText()
            assertTrue(pushed.contains("\"type\":\"changed\""), "unexpected payload: $pushed")
            assertTrue(markerOf(pushed) > markerOf(initial), "marker must grow: $initial -> $pushed")
        } finally {
            session.close()
        }
    }

    private fun markerOf(json: String): Long =
        Regex("\"marker\":(\\d+)").find(json)?.groupValues?.get(1)?.toLong()
            ?: error("no marker in $json")

    private suspend fun ClientProvider.loginAsAdmin(): String {
        val login = client.post("/api/login") {
            contentType(ContentType.Application.Json)
            setBody("""{"email":"admin","password":"admin"}""")
        }
        assertEquals(HttpStatusCode.OK, login.status)
        return login.headers[SESSION_HEADER] ?: error("login did not return a $SESSION_HEADER header")
    }

    private suspend fun DefaultClientWebSocketSession.receiveText(): String =
        withTimeout(awaitTimeout) { (incoming.receive() as Frame.Text).readText() }

    companion object {
        private const val SESSION_HEADER = "X-Api-Session"
    }
}
