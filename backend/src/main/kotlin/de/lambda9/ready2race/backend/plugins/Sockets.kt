package de.lambda9.ready2race.backend.plugins

import de.lambda9.ready2race.backend.app.JEnv
import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.timing.boundary.TimingBroadcaster
import de.lambda9.ready2race.backend.calls.requests.authenticateAny
import de.lambda9.tailwind.core.KIO.Companion.unsafeRunSync
import de.lambda9.tailwind.core.extensions.exit.fold
import io.ktor.server.application.*
import io.ktor.server.routing.*
import io.ktor.server.websocket.*
import io.ktor.websocket.*
import java.util.UUID
import kotlin.time.Duration.Companion.seconds

fun Application.configureSockets(env: JEnv) {
    install(WebSockets) {
        pingPeriod = 15.seconds
        timeout = 30.seconds
    }

    routing {
        webSocket("/api/ws/event/{eventId}/timing") {
            val eventId = call.parameters["eventId"]?.let { runCatching { UUID.fromString(it) }.getOrNull() }
            if (eventId == null) {
                close(CloseReason(CloseReason.Codes.CANNOT_ACCEPT, "Invalid eventId"))
                return@webSocket
            }

            val authorized = call.authenticateAny(
                Privilege.UpdateAppTimingGlobal,
                Privilege.ReadEventGlobal,
            ).unsafeRunSync(env).fold(
                onSuccess = { true },
                onError = { false },
                onDefect = { false },
            )
            if (!authorized) {
                close(CloseReason(CloseReason.Codes.VIOLATED_POLICY, "Unauthorized"))
                return@webSocket
            }

            val subscriber = TimingBroadcaster.subscribe(eventId) { json ->
                send(Frame.Text(json))
            }
            try {
                for (frame in incoming) {
                    // Clients only listen; incoming frames are ignored (keepalive handled by ktor pings)
                }
            } finally {
                TimingBroadcaster.unsubscribe(eventId, subscriber)
            }
        }
    }
}
