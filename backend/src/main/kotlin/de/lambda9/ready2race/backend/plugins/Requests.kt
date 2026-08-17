package de.lambda9.ready2race.backend.plugins

import de.lambda9.ready2race.backend.app.appuser.entity.PasswordResetInitRequest
import de.lambda9.ready2race.backend.app.auth.entity.LoginRequest
import de.lambda9.ready2race.backend.calls.requests.receiveKIO
import de.lambda9.tailwind.core.KIO.Companion.unsafeRunSync
import de.lambda9.tailwind.core.extensions.exit.getOrThrow
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.plugins.doublereceive.*
import io.ktor.server.plugins.ratelimit.*
import io.ktor.server.request.*
import kotlin.time.Duration.Companion.minutes

// todo: @refactor: remove as middleware and implement own version
fun Application.configureRequests() {
    install(DoubleReceive) {
        // A websocket handshake hands the raw request channel to the upgraded session. Caching it
        // (and discarding the remainder once the call completes) races with the session's reads and
        // kills the connection right after the handshake. Upgrade requests never receive a body
        // twice, so they are excluded from the cache.
        //
        // The `Upgrade` header alone is client-controlled, so any request (e.g. POST /api/login)
        // could set it to dodge caching and trigger a 500 on double body receive. Requiring the
        // websocket path prefix too means only our actual websocket routes are excluded.
        excludeFromCache { call, _ ->
            call.request.path().startsWith("/api/ws/") &&
                call.request.headers[HttpHeaders.Upgrade]?.equals("websocket", ignoreCase = true) == true
        }
    }
    install(RateLimit) {
        register(RateLimitName("login")) {
            rateLimiter(limit = 10, refillPeriod = 5.minutes)
            requestKey { call ->
                call.receiveKIO(LoginRequest.example).unsafeRunSync().getOrThrow().email
            }
        }
        register(RateLimitName("resetPassword")){
            rateLimiter(limit = 5, refillPeriod = 5.minutes)
            requestKey { call ->
                call.receiveKIO(PasswordResetInitRequest.example).unsafeRunSync().getOrThrow().email
            }
        }
    }
}