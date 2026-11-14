package de.lambda9.ready2race.backend.calls.requests

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.config.Config
import de.lambda9.ready2race.backend.kio.accessConfig
import de.lambda9.tailwind.core.KIO
import io.ktor.server.application.*
import io.ktor.server.request.*
import java.net.URI

/**
 * Prüft die `callbackUrl`, aus der Mails ihren Link bauen (`callbackUrl + token`).
 *
 * Das Frontend schickt sie mit, weil nur es seinen Basispfad kennt. Ungeprüft ließe sie sich auf
 * einen fremden Server zeigen: Wer für eine fremde Adresse einen Passwort-Reset auslöst, bekäme
 * den Token, sobald das Opfer auf den Link in der echten Mail des Veranstalters klickt.
 *
 * Erlaubt sind deshalb nur Ziele, deren Schema, Host und Port zu einem Eintrag aus
 * `FRONTEND_ORIGINS` passen; der Pfad bleibt frei, weil der Basispfad je Installation variiert.
 *
 * Ohne `FRONTEND_ORIGINS` - so laufen bestehende Installationen weiter - gilt eine Rückfallregel:
 * der Host muss der sein, unter dem die Anfrage ankam (`Host`-Kopf, Port egal, weil Vite und
 * Backend lokal auf verschiedenen Ports laufen). Im Modus DEV und TEST sind zusätzlich
 * localhost/127.0.0.1/::1 erlaubt. Die Rückfallregel ist schwächer, weil ein Angreifer den
 * `Host`-Kopf selbst setzen kann, sofern der Reverse-Proxy davor jeden Host durchreicht - für
 * den Betrieb gehört `FRONTEND_ORIGINS` deshalb gesetzt (Warnung beim Start).
 */
object CallbackUrls {

    private val loopbackHosts = setOf("localhost", "127.0.0.1", "[::1]", "::1")

    /**
     * Ein Eintrag aus `FRONTEND_ORIGINS` in der Form `schema://host[:port]`, normalisiert auf
     * Kleinschreibung und ausgeschriebenen Port. Pfad, Query und Fragment sind nicht erlaubt.
     */
    fun parseOrigin(value: String): String {
        val uri = URI(value.trim())
        val scheme = uri.scheme?.lowercase()
        require(scheme == "http" || scheme == "https") { "Origin needs http or https: '$value'" }
        val host = requireNotNull(uri.host) { "Origin needs a host: '$value'" }
        require(uri.rawUserInfo == null) { "Origin must not contain user info: '$value'" }
        require(uri.rawPath.isNullOrEmpty() || uri.rawPath == "/") { "Origin must not contain a path: '$value'" }
        require(uri.rawQuery == null && uri.rawFragment == null) { "Origin must not contain query or fragment: '$value'" }
        return origin(scheme, host, uri.port)
    }

    /** Kommagetrennte Liste wie in `FRONTEND_ORIGINS`. */
    fun parseOrigins(value: String): List<String> =
        value.split(',').map { it.trim() }.filter { it.isNotEmpty() }.map { parseOrigin(it) }
            .also { require(it.isNotEmpty()) { "FRONTEND_ORIGINS is empty" } }

    private fun origin(scheme: String, host: String, port: Int): String {
        val effectivePort = when {
            port != -1 -> port
            scheme == "https" -> 443
            else -> 80
        }
        return "$scheme://${host.lowercase()}:$effectivePort"
    }

    /**
     * @param requestHost der Host, unter dem die Anfrage ankam (ohne Port); nur für die
     *   Rückfallregel ohne `FRONTEND_ORIGINS`.
     */
    fun isAllowed(
        callbackUrl: String,
        mode: Config.Mode,
        frontendOrigins: List<String>?,
        requestHost: String?,
    ): Boolean {
        val uri = try {
            URI(callbackUrl.trim())
        } catch (_: Exception) {
            return false
        }
        val scheme = uri.scheme?.lowercase() ?: return false
        if (scheme != "http" && scheme != "https") return false
        val host = uri.host?.lowercase() ?: return false
        if (uri.rawUserInfo != null) return false

        if (frontendOrigins != null) {
            return origin(scheme, host, uri.port) in frontendOrigins
        }

        if (requestHost != null && host == requestHost.lowercase()) {
            return true
        }

        return (mode == Config.Mode.DEV || mode == Config.Mode.TEST) && host in loopbackHosts
    }
}

/**
 * Lehnt eine `callbackUrl` ab, die nicht zu den erlaubten Frontend-Adressen passt (siehe
 * [CallbackUrls]). `null` ist erlaubt - einige Anfragen tragen die Adresse nur optional.
 */
fun ApplicationCall.checkCallbackUrl(callbackUrl: String?): App<RequestError, Unit> = KIO.comprehension {
    val config = !accessConfig()
    val requestHost = request.host()
    if (
        callbackUrl == null ||
        CallbackUrls.isAllowed(callbackUrl, config.mode, config.frontendOrigins, requestHost)
    ) {
        KIO.unit
    } else {
        logger.warn {
            "Rejected callbackUrl '$callbackUrl' (request host '$requestHost'). " +
                "Set FRONTEND_ORIGINS to the origin(s) the frontend is served from."
        }
        KIO.fail(RequestError.CallbackUrlNotAllowed)
    }
}
