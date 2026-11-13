package de.lambda9.ready2race.backend.plugins

import de.lambda9.ready2race.backend.app.appuser.entity.PasswordResetInitRequest
import de.lambda9.ready2race.backend.app.auth.entity.LoginRequest
import de.lambda9.ready2race.backend.calls.requests.receiveKIO
import de.lambda9.tailwind.core.KIO.Companion.unsafeRunSync
import de.lambda9.tailwind.core.extensions.exit.getOrThrow
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.plugins.*
import io.ktor.server.plugins.doublereceive.*
import io.ktor.server.plugins.ratelimit.*
import io.ktor.server.request.*
import io.ktor.server.routing.*
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Duration.Companion.seconds

/**
 * Rate-Limit, dessen Schlüssel aus dem Request-Body kommt (Login, Passwort-Reset): Der Limiter liest
 * den Body schon im `requestKey`, der Handler danach noch einmal. Dafür puffert DoubleReceive den
 * Body - aber nur auf diesen Routen. Global installiert lag jeder Multipart-Upload (bis 50 MB)
 * zusätzlich vollständig im Heap.
 */
fun Route.rateLimitWithBodyKey(name: RateLimitName, build: Route.() -> Unit): Route {
    install(DoubleReceive)
    return rateLimit(name, build)
}

// todo: @refactor: remove as middleware and implement own version
fun Application.configureRequests(trustedProxyHops: Int = 0) {
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
        // Notbremse für die öffentlichen Info-Endpoints (Athleten-Anzeige, Kiosk-Daten),
        // kein Feinsteuerungsinstrument: Auf einer Regatta teilen sich viele Telefone eine
        // IP (Vereins-WLAN, Carrier-NAT), und steht die Anwendung hinter einem Proxy ohne
        // Forwarded-Header, fallen sogar alle Zuschauer auf einen Schlüssel zusammen.
        // Die Grenze liegt deshalb bewusst weit über jedem legitimen Aufkommen
        // (500 Telefone im 15-Sekunden-Takt sind ~33 Anfragen/s) und fängt nur Amok
        // laufende Clients und stumpfes Hämmern ab. Die eigentliche Lastdeckelung leistet
        // der Zwischenspeicher in EventInfoService.
        register(RateLimitName("publicInfo")) {
            rateLimiter(limit = 500, refillPeriod = 5.seconds)
            requestKey { call -> call.clientAddress(trustedProxyHops) }
        }
    }
}

/**
 * Die Adresse des Clients für Rate-Limits. Hinter einem Reverse-Proxy ist `origin.remoteHost` für
 * alle Zuschauer die Adresse des Proxys; die echte steht dann in `X-Forwarded-For`.
 *
 * Dem Kopf wird nur so weit getraut, wie Proxys davor stehen ([trustedProxyHops], aus
 * `TRUSTED_PROXY_HOPS`): Jeder Proxy hängt die Adresse, von der er die Anfrage bekam, HINTEN an.
 * Bei einem Proxy (nginx mit `$proxy_add_x_forwarded_for`) ist also der letzte Eintrag die echte
 * Client-Adresse; alles links davon kann der Client selbst geschrieben haben. Ohne gesetzte Hops
 * (Vorgabe 0) bleibt der Kopf unbeachtet - sonst könnte jeder Client sich beliebige Schlüssel
 * ausdenken.
 */
fun ApplicationCall.clientAddress(trustedProxyHops: Int): String =
    forwardedClientAddress(
        forwardedFor = request.headers.getAll(HttpHeaders.XForwardedFor),
        remoteHost = request.origin.remoteHost,
        trustedProxyHops = trustedProxyHops,
    )

internal fun forwardedClientAddress(
    forwardedFor: List<String>?,
    remoteHost: String,
    trustedProxyHops: Int,
): String {
    if (trustedProxyHops <= 0) return remoteHost
    val chain = forwardedFor.orEmpty()
        .flatMap { it.split(',') }
        .map { it.trim() }
        .filter { it.isNotEmpty() }
    val index = chain.size - trustedProxyHops
    // Kürzer als erwartet: der Kopf stammt nicht von den konfigurierten Proxys - nicht trauen.
    return if (index >= 0) chain[index] else remoteHost
}
