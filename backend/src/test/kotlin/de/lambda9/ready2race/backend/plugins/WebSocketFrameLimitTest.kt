package de.lambda9.ready2race.backend.plugins

import io.ktor.client.plugins.websocket.*
import io.ktor.server.application.*
import io.ktor.server.routing.*
import io.ktor.server.testing.*
import io.ktor.server.websocket.*
import io.ktor.websocket.*
import kotlinx.coroutines.channels.consumeEach
import kotlinx.coroutines.withTimeout
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.time.Duration.Companion.seconds
import io.ktor.client.plugins.websocket.WebSockets as ClientWebSockets
import io.ktor.server.websocket.WebSockets as ServerWebSockets

/** Ein überlanger eingehender Rahmen schließt die Verbindung, statt im Heap zu landen. */
class WebSocketFrameLimitTest {

    private fun ApplicationTestBuilder.setup() {
        application {
            install(ServerWebSockets, webSocketOptions)
            routing {
                webSocket("/ws") {
                    // Wie die echten Handler: eingehende Rahmen werden ignoriert.
                    incoming.consumeEach { }
                }
            }
        }
    }

    @Test
    fun `Rahmen ueber der Grenze schliesst mit TOO_BIG`() = testApplication {
        setup()
        val client = createClient { install(ClientWebSockets) }

        client.webSocket("/ws") {
            send(Frame.Binary(true, ByteArray(64 * 1024)))
            val reason = withTimeout(5.seconds) { closeReason.await() }
            assertEquals(CloseReason.Codes.TOO_BIG.code, reason?.code)
        }
    }

    @Test
    fun `kleiner Rahmen laesst die Verbindung offen`() = testApplication {
        setup()
        val client = createClient { install(ClientWebSockets) }

        client.webSocket("/ws") {
            send(Frame.Text("pong"))
            send(Frame.Binary(true, ByteArray(WEBSOCKET_MAX_FRAME_SIZE.toInt() - 16)))
            close(CloseReason(CloseReason.Codes.NORMAL, "fertig"))
            val reason = withTimeout(5.seconds) { closeReason.await() }
            assertEquals(CloseReason.Codes.NORMAL.code, reason?.code)
        }
    }
}
