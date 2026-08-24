package de.lambda9.ready2race.backend.app.eventInfo

import de.lambda9.ready2race.backend.app.eventInfo.boundary.BoardService
import de.lambda9.ready2race.backend.app.eventInfo.boundary.BoardViewBroadcaster
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardConfig
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardElement
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardElementType
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardRequest
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardTile
import de.lambda9.ready2race.backend.app.timing.addTestStation
import de.lambda9.ready2race.backend.app.timing.boundary.TimingDeviceTokenService
import de.lambda9.ready2race.backend.app.timing.createTestEventWithAdmin
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationType
import de.lambda9.ready2race.backend.plugins.TIMING_WS_SUBPROTOCOL
import de.lambda9.ready2race.testing.testApplicationComprehension
import io.ktor.client.HttpClient
import io.ktor.client.plugins.websocket.*
import io.ktor.client.request.*
import io.ktor.http.*
import io.ktor.server.testing.ClientProvider
import io.ktor.websocket.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.withTimeout
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Duration.Companion.seconds

/**
 * Routen-Abdeckung für `GET /api/ws/event/{eventId}/board/{boardId}` — den Board-Kanal, der die
 * FERTIGE Ansicht pusht statt nur einen Änderungsmarker.
 *
 * Zwei Dinge stehen hier auf dem Spiel und werden deshalb beide von außen geprüft:
 * die Tür (Sitzung ODER Board-Token genau dieses Boards — sonst nichts) und die Zusage, dass ein
 * Client nach dem Verbinden und nach jeder Änderung den vollen Stand bekommt, ohne nachzuladen.
 * Der Push-Test deckt zugleich den After-Commit-Weg in `EventChangeMarker.bump` ab.
 */
class BoardViewSocketTest {

    // NOTE: nicht `timeout` nennen — DefaultWebSocketSession hat ein gleichnamiges Member.
    private val awaitTimeout = 10.seconds

    private fun boardRequest(name: String) = BoardRequest(
        name = name,
        config = BoardConfig(
            columns = 1,
            tiles = listOf(
                BoardTile(elements = listOf(BoardElement(type = BoardElementType.MATCH, offset = 0)))
            ),
        ),
    )

    @Test
    fun handshakeWithInvalidIdsIsRejected() = testApplicationComprehension {
        val wsClient = createClient { install(WebSockets) }

        val session = wsClient.webSocketSession("/api/ws/event/not-a-uuid/board/also-not-a-uuid")
        val closeReason = withTimeout(awaitTimeout) { session.closeReason.await() }

        assertNotNull(closeReason)
        assertEquals(CloseReason.Codes.CANNOT_ACCEPT.code, closeReason.code)
    }

    @Test
    fun handshakeWithoutAnyTokenIsRejected() = testApplicationComprehension {
        // Der Unterschied zum Veranstaltungs-Kanal: der ist öffentlich, dieser nicht — er trägt
        // dieselbe Nutzlast wie der (nicht mehr öffentliche) HTTP-Endpunkt.
        val (eventId, _) = !createTestEventWithAdmin()
        val boardId = (!BoardService.createBoard(eventId, boardRequest("Anzeige Steg"))).dto.id
        val wsClient = createClient { install(WebSockets) }

        val session = wsClient.webSocketSession("/api/ws/event/$eventId/board/$boardId")
        val closeReason = withTimeout(awaitTimeout) { session.closeReason.await() }

        assertNotNull(closeReason)
        assertEquals(CloseReason.Codes.VIOLATED_POLICY.code, closeReason.code)
    }

    @Test
    fun aBoardTokenReceivesTheFullViewOnConnect() = testApplicationComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val boardId = (!BoardService.createBoard(eventId, boardRequest("Anzeige Steg"))).dto.id
        val link = (!TimingDeviceTokenService.shareLinkForBoard(eventId, boardId, userId)).dto

        val wsClient = createClient { install(WebSockets) }
        val session = wsClient.boardSocketSession(eventId, boardId, link.token)
        try {
            val json = session.receiveText()
            // Der ganze Stand, nicht bloß ein Fingerzeig: Typ, Board, Name der Veranstaltung
            // und die aufgelöste Konfiguration.
            assertTrue(json.contains("\"type\":\"boardView\""), "unexpected payload: $json")
            assertTrue(json.contains("\"boardId\":\"$boardId\""), "unexpected payload: $json")
            assertTrue(json.contains("\"config\""), "unexpected payload: $json")
            assertTrue(json.contains("\"serverTime\""), "unexpected payload: $json")
        } finally {
            session.close()
        }
    }

    @Test
    fun aBoardTokenDoesNotOpenAnotherBoardsChannel() = testApplicationComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val boardId = (!BoardService.createBoard(eventId, boardRequest("Anzeige Steg"))).dto.id
        val otherBoardId = (!BoardService.createBoard(eventId, boardRequest("Anzeige Zelt"))).dto.id
        val link = (!TimingDeviceTokenService.shareLinkForBoard(eventId, boardId, userId)).dto

        val wsClient = createClient { install(WebSockets) }
        val session = wsClient.boardSocketSession(eventId, otherBoardId, link.token)
        val closeReason = withTimeout(awaitTimeout) { session.closeReason.await() }

        assertNotNull(closeReason)
        assertEquals(CloseReason.Codes.VIOLATED_POLICY.code, closeReason.code)
    }

    @Test
    fun aTimingStationTokenDoesNotOpenABoardChannel() = testApplicationComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val boardId = (!BoardService.createBoard(eventId, boardRequest("Anzeige Steg"))).dto.id
        val station = (!TimingDeviceTokenService.shareLink(eventId, stationId, userId)).dto

        val wsClient = createClient { install(WebSockets) }
        val session = wsClient.boardSocketSession(eventId, boardId, station.token)
        val closeReason = withTimeout(awaitTimeout) { session.closeReason.await() }

        assertNotNull(closeReason)
        assertEquals(CloseReason.Codes.VIOLATED_POLICY.code, closeReason.code)
    }

    @Test
    fun aChangePushesTheWholeViewAfterCommit() = testApplicationComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val boardId = (!BoardService.createBoard(eventId, boardRequest("Anzeige Steg"))).dto.id
        val link = (!TimingDeviceTokenService.shareLinkForBoard(eventId, boardId, userId)).dto
        val sessionHeader = loginAsAdmin()

        val wsClient = createClient { install(WebSockets) }
        val session = wsClient.boardSocketSession(eventId, boardId, link.token)
        try {
            // Erst den Begrüßungsrahmen konsumieren, damit unten wirklich der Push gemessen wird.
            val initial = session.receiveText()
            assertTrue(initial.contains("\"type\":\"boardView\""), "unexpected: $initial")

            val response = client.put("/api/event/$eventId/notice") {
                header(SESSION_HEADER, sessionHeader)
                contentType(ContentType.Application.Json)
                setBody("""{"text":"Startverschiebung","severity":"INFO"}""")
            }
            assertEquals(HttpStatusCode.NoContent, response.status)

            // Der Hinweisbanner steckt mit in der Board-Ansicht — die gepushte Nutzlast trägt ihn
            // also bereits, ohne dass der Client irgendetwas nachgeladen hätte. Genau das ist der
            // Zweck dieses Kanals.
            val pushed = session.receiveText()
            assertTrue(pushed.contains("\"type\":\"boardView\""), "unexpected payload: $pushed")
            assertTrue(pushed.contains("Startverschiebung"), "notice missing in push: $pushed")
        } finally {
            session.close()
        }
    }

    @Test
    fun aSessionWithBoardReadRightOpensTheChannelToo() = testApplicationComprehension {
        val (eventId, _) = !createTestEventWithAdmin()
        val boardId = (!BoardService.createBoard(eventId, boardRequest("Anzeige Steg"))).dto.id
        val sessionHeader = loginAsAdmin()

        // Nicht-Browser-Weg: der Sitzungs-Header statt des Subprotokolls.
        val wsClient = createClient { install(WebSockets) }
        val session = wsClient.webSocketSession("/api/ws/event/$eventId/board/$boardId") {
            header(SESSION_HEADER, sessionHeader)
        }
        try {
            val json = session.receiveText()
            assertTrue(json.contains("\"boardId\":\"$boardId\""), "unexpected payload: $json")
        } finally {
            session.close()
        }
    }

    @Test
    fun aConfigChangePushesTheNewConfiguration() = testApplicationComprehension {
        // Der zweite Auslöser des Kanals: eine Konfigurationsänderung zählt den Änderungsmarker
        // der Veranstaltung bewusst NICHT hoch (sonst entwertete jedes Speichern im Editor die
        // Zwischenspeicher aller Anzeigen) — trotzdem soll die Wand sofort zeigen, was man eben
        // gespeichert hat, statt bis zu zwei Minuten am gestreckten Takt zu hängen.
        val (eventId, userId) = !createTestEventWithAdmin()
        val boardId = (!BoardService.createBoard(eventId, boardRequest("Anzeige Steg"))).dto.id
        val link = (!TimingDeviceTokenService.shareLinkForBoard(eventId, boardId, userId)).dto
        val sessionHeader = loginAsAdmin()

        val wsClient = createClient { install(WebSockets) }
        val session = wsClient.boardSocketSession(eventId, boardId, link.token)
        try {
            val initial = session.receiveText()
            assertTrue(initial.contains("\"refreshIntervalSeconds\":15"), "unexpected: $initial")

            val response = client.put("/api/event/$eventId/boards/$boardId") {
                header(SESSION_HEADER, sessionHeader)
                contentType(ContentType.Application.Json)
                setBody(
                    """{"name":"Anzeige Steg","config":{"columns":1,"refreshIntervalSeconds":7,""" +
                        """"tiles":[{"elements":[{"type":"MATCH","offset":0}]}]}}"""
                )
            }
            assertEquals(HttpStatusCode.NoContent, response.status)

            val pushed = session.receiveText()
            assertTrue(pushed.contains("\"refreshIntervalSeconds\":7"), "unexpected payload: $pushed")
        } finally {
            session.close()
        }
    }

    @Test
    fun twoDisplaysShareOneChannelAndBothGetThePush() = testApplicationComprehension {
        // Die Zusage „je Board EINMAL gerechnet": zwei Bildschirme vor derselben Anzeige hängen
        // an einem Kanal. Von außen sichtbar ist davon die Abonnentenzahl — und dass beide
        // dieselbe Nutzlast bekommen.
        val (eventId, userId) = !createTestEventWithAdmin()
        val boardId = (!BoardService.createBoard(eventId, boardRequest("Anzeige Steg"))).dto.id
        val link = (!TimingDeviceTokenService.shareLinkForBoard(eventId, boardId, userId)).dto
        val sessionHeader = loginAsAdmin()

        val wsClient = createClient { install(WebSockets) }
        val first = wsClient.boardSocketSession(eventId, boardId, link.token)
        val second = wsClient.boardSocketSession(eventId, boardId, link.token)
        try {
            first.receiveText()
            second.receiveText()
            assertEquals(2, BoardViewBroadcaster.subscriptionCount(boardId))

            val response = client.put("/api/event/$eventId/notice") {
                header(SESSION_HEADER, sessionHeader)
                contentType(ContentType.Application.Json)
                setBody("""{"text":"Wind","severity":"WARNING"}""")
            }
            assertEquals(HttpStatusCode.NoContent, response.status)

            assertTrue(first.receiveText().contains("Wind"), "first display missed the push")
            assertTrue(second.receiveText().contains("Wind"), "second display missed the push")
        } finally {
            first.close()
            second.close()
        }

        // Mit dem letzten Abonnenten verschwindet der Kanal — ab dann wird für dieses Board
        // nichts mehr gerechnet. Das Schließen läuft nebenläufig, deshalb kurz nachfassen.
        var remaining: Int? = BoardViewBroadcaster.subscriptionCount(boardId)
        repeat(50) {
            if (remaining == null) return@repeat
            delay(100)
            remaining = BoardViewBroadcaster.subscriptionCount(boardId)
        }
        assertNull(remaining, "the board channel must vanish with its last subscriber")
    }

    private suspend fun ClientProvider.loginAsAdmin(): String {
        val login = client.post("/api/login") {
            contentType(ContentType.Application.Json)
            setBody("""{"email":"admin","password":"admin"}""")
        }
        assertEquals(HttpStatusCode.OK, login.status)
        return login.headers[SESSION_HEADER] ?: error("login did not return a $SESSION_HEADER header")
    }

    /** Spiegelt `new WebSocket(url, ["r2r", token])` im Browser. */
    private suspend fun HttpClient.boardSocketSession(
        eventId: UUID,
        boardId: UUID,
        token: String,
    ): DefaultClientWebSocketSession =
        webSocketSession("/api/ws/event/$eventId/board/$boardId") {
            header(HttpHeaders.SecWebSocketProtocol, "$TIMING_WS_SUBPROTOCOL, $token")
        }

    private suspend fun DefaultClientWebSocketSession.receiveText(): String =
        withTimeout(awaitTimeout) { (incoming.receive() as Frame.Text).readText() }

    companion object {
        private const val SESSION_HEADER = "X-Api-Session"
    }
}
