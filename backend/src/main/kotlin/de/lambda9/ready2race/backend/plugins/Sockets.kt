package de.lambda9.ready2race.backend.plugins

import de.lambda9.ready2race.backend.app.JEnv
import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.timing.boundary.TimingBroadcaster
import de.lambda9.ready2race.backend.calls.requests.authenticateAnyWithToken
import de.lambda9.ready2race.backend.sessions.UserSession
import de.lambda9.tailwind.core.KIO.Companion.unsafeRunSync
import de.lambda9.tailwind.core.extensions.exit.fold
import io.github.oshai.kotlinlogging.KotlinLogging
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.routing.*
import io.ktor.server.sessions.*
import io.ktor.server.websocket.*
import io.ktor.websocket.*
import kotlinx.coroutines.channels.consumeEach
import java.util.UUID
import kotlin.time.Duration.Companion.seconds

private val logger = KotlinLogging.logger {}

/**
 * Subprotocol every timing websocket client has to offer. Browsers cannot set request headers on a
 * websocket handshake, so the session token is transported as the second subprotocol entry:
 *
 * ```js
 * new WebSocket(url, ["r2r", token])
 * ```
 *
 * Ktor only routes handshakes that offer this subprotocol to the protocol-aware route below and
 * echoes it back in `Sec-WebSocket-Protocol`, which browsers require to keep the connection.
 */
const val TIMING_WS_SUBPROTOCOL = "r2r"

private const val TIMING_WS_PATH = "/api/ws/event/{eventId}/timing"

fun Application.configureSockets(env: JEnv) {
    install(WebSockets) {
        pingPeriod = 15.seconds
        timeout = 30.seconds
    }

    routing {
        webSocket(TIMING_WS_PATH, protocol = TIMING_WS_SUBPROTOCOL) {
            timingSocket(env)
        }

        // Fallback for non-browser clients that can send the X-Api-Session header and therefore do
        // not need to offer a subprotocol.
        webSocket(TIMING_WS_PATH) {
            timingSocket(env)
        }
    }
}

private suspend fun DefaultWebSocketServerSession.timingSocket(env: JEnv) {
    val rawEventId = call.parameters["eventId"]
    val eventId = rawEventId?.let { runCatching { UUID.fromString(it) }.getOrNull() }
    if (eventId == null) {
        // Never log the raw path parameter as-is: it is fully client-controlled and could carry
        // CR/LF sequences to forge log entries. Strip them before logging.
        val sanitized = rawEventId?.replace(Regex("[\r\n]"), "")
        logger.info { "Rejecting timing ws handshake: invalid eventId '$sanitized'" }
        close(CloseReason(CloseReason.Codes.CANNOT_ACCEPT, "Invalid eventId"))
        return
    }

    val token = call.sessions.get<UserSession>()?.token ?: call.subprotocolToken()
    if (token == null) {
        logger.info { "Rejecting timing ws handshake for event $eventId: no session token provided" }
        close(CloseReason(CloseReason.Codes.VIOLATED_POLICY, "Unauthorized"))
        return
    }

    val authorized = authenticateAnyWithToken(
        token,
        Privilege.UpdateAppTimingGlobal,
        Privilege.UpdateEventGlobal,
        Privilege.ReadEventGlobal,
    ).unsafeRunSync(env).fold(
        onSuccess = { true },
        onError = { error ->
            logger.info { "Rejecting timing ws handshake for event $eventId: $error" }
            false
        },
        onDefect = { defect ->
            logger.warn(defect) { "Rejecting timing ws handshake for event $eventId: authentication failed" }
            false
        },
    )
    if (!authorized) {
        close(CloseReason(CloseReason.Codes.VIOLATED_POLICY, "Unauthorized"))
        return
    }

    val subscription = TimingBroadcaster.subscribe(eventId) { json ->
        send(Frame.Text(json))
    }
    try {
        // Clients only listen; incoming frames are ignored (keepalive is handled by ktor pings).
        incoming.consumeEach { }
    } finally {
        TimingBroadcaster.unsubscribe(subscription)
    }
}

/**
 * Reads the session token from the `Sec-WebSocket-Protocol` header, which is expected to hold
 * exactly `["r2r", <token>]`.
 */
private fun ApplicationCall.subprotocolToken(): String? {
    val offered = request.headers[HttpHeaders.SecWebSocketProtocol]
        ?.let { parseHeaderValue(it) }
        ?.map { it.value }
        ?: return null

    return offered.takeIf { it.size == 2 && it.first() == TIMING_WS_SUBPROTOCOL }?.get(1)
}
