package de.lambda9.ready2race.backend.plugins

import de.lambda9.ready2race.backend.app.JEnv
import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.eventInfo.boundary.BoardViewBroadcaster
import de.lambda9.ready2race.backend.app.eventInfo.boundary.EventChangeBroadcaster
import de.lambda9.ready2race.backend.app.eventInfo.boundary.EventChangeMarker
import de.lambda9.ready2race.backend.app.timing.boundary.TimingBroadcaster
import de.lambda9.ready2race.backend.app.timing.boundary.TimingDeviceTokenService
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

private const val EVENT_CHANGE_WS_PATH = "/api/ws/event/{eventId}/info"

private const val BOARD_VIEW_WS_PATH = "/api/ws/event/{eventId}/board/{boardId}"

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

        // Veranstaltungs-Kanal der Anzeigen: pusht den Änderungsmarker (EventChangeMarker) an
        // alle verbundenen Boards, damit die nicht mehr im Takt pollen müssen. Bewusst OHNE
        // Authentifizierung: der Kanal spiegelt die öffentlichen Anzeige-Endpunkte unter
        // /event/{eventId}/info (eventInfo.kt) — montierte Bildschirme und Athleten-Handys laden
        // ohne Anmeldung, also verbinden sie sich auch ohne. Preisgegeben wird nur „es hat sich
        // etwas geändert" samt Zählerstand, nie Nutzdaten.
        webSocket(EVENT_CHANGE_WS_PATH) {
            eventChangeSocket()
        }

        // Der Board-Kanal: schickt die FERTIGE Ansicht (BoardViewDto), nicht bloß einen
        // Fingerzeig. Deshalb ist er - anders als der Veranstaltungs-Kanal darüber - kein
        // öffentlicher Kanal: er trägt dieselbe Nutzlast wie GET /event/{eventId}/info/board/
        // {boardId} und muss folglich dieselbe Tür haben. Authentifiziert wird wie in der
        // Zeitnahme, samt Token-Slot des Subprotokolls für Browser (siehe timingSocket).
        webSocket(BOARD_VIEW_WS_PATH, protocol = TIMING_WS_SUBPROTOCOL) {
            boardViewSocket(env)
        }

        // Fallback für Nicht-Browser-Clients, die den X-Api-Session-Header senden können und
        // deshalb kein Subprotokoll anbieten müssen.
        webSocket(BOARD_VIEW_WS_PATH) {
            boardViewSocket(env)
        }
    }
}

private suspend fun DefaultWebSocketServerSession.eventChangeSocket() {
    val rawEventId = call.parameters["eventId"]
    val eventId = rawEventId?.let { runCatching { UUID.fromString(it) }.getOrNull() }
    if (eventId == null) {
        // Wie beim Timing-Kanal: der Pfadparameter ist client-kontrolliert und könnte per CR/LF
        // Logzeilen fälschen — vor dem Loggen entschärfen.
        val sanitized = rawEventId?.replace(Regex("[\r\n]"), "")
        logger.info { "Rejecting event-change ws handshake: invalid eventId '$sanitized'" }
        close(CloseReason(CloseReason.Codes.CANNOT_ACCEPT, "Invalid eventId"))
        return
    }

    // Der aktuelle Stand sofort beim Verbinden: ein Client, der nach einem Funkloch neu
    // verbindet, sieht daran (und am Reconnect selbst), dass er nachladen muss.
    send(Frame.Text(EventChangeBroadcaster.message(EventChangeMarker.current(eventId))))

    val subscription = EventChangeBroadcaster.subscribe(eventId) { json ->
        send(Frame.Text(json))
    }
    try {
        // Clients hören nur zu; eingehende Frames werden ignoriert (Keepalive machen die
        // Ktor-Pings aus configureSockets).
        incoming.consumeEach { }
    } finally {
        EventChangeBroadcaster.unsubscribe(subscription)
    }
}

/**
 * Der Push-Kanal EINER Anzeige: liefert beim Verbinden und nach jeder Änderung die komplette
 * Board-Ansicht, damit die Anzeige nichts nachladen muss (das ist der Punkt - ein
 * Livestream-Overlay soll im selben Moment umspringen wie das Bild).
 *
 * Zwei Wege hinein, exakt die des HTTP-Zwillings (eventInfo.kt):
 *   * eine Sitzung mit READ BOARD oder READ EVENT - wer die Anzeige sehen darf, darf sie auch
 *     gepusht bekommen;
 *   * ein Board-Geräte-Token für GENAU DIESES Board. Ein Bildschirm an der Hallenwand und eine
 *     OBS-Quelle können sich nicht anmelden; sie tragen den geteilten Link.
 * Browser können beim Handshake keine eigenen Header setzen, deshalb reist das Token wie in der
 * Zeitnahme im zweiten Eintrag des Subprotokolls (`new WebSocket(url, ["r2r", token])`).
 */
private suspend fun DefaultWebSocketServerSession.boardViewSocket(env: JEnv) {
    val rawEventId = call.parameters["eventId"]
    val rawBoardId = call.parameters["boardId"]
    val eventId = rawEventId?.let { runCatching { UUID.fromString(it) }.getOrNull() }
    val boardId = rawBoardId?.let { runCatching { UUID.fromString(it) }.getOrNull() }
    if (eventId == null || boardId == null) {
        // Wie oben: die Pfadparameter sind client-kontrolliert und könnten per CR/LF Logzeilen
        // fälschen - vor dem Loggen entschärfen.
        val sanitized = "${rawEventId?.replace(Regex("[\r\n]"), "")}/${rawBoardId?.replace(Regex("[\r\n]"), "")}"
        logger.info { "Rejecting board ws handshake: invalid ids '$sanitized'" }
        close(CloseReason(CloseReason.Codes.CANNOT_ACCEPT, "Invalid ids"))
        return
    }

    val token = call.sessions.get<UserSession>()?.token ?: call.subprotocolToken()
    if (token == null) {
        logger.info { "Rejecting board ws handshake for board $boardId: no token provided" }
        close(CloseReason(CloseReason.Codes.VIOLATED_POLICY, "Unauthorized"))
        return
    }

    val sessionAuthorized = authenticateAnyWithToken(
        token,
        Privilege.ReadBoardGlobal,
        Privilege.ReadEventGlobal,
    ).unsafeRunSync(env).fold(
        onSuccess = { true },
        onError = { false },
        onDefect = { defect ->
            logger.warn(defect) { "Rejecting board ws handshake for board $boardId: authentication failed" }
            false
        },
    )

    // Wie in der Zeitnahme greift der Token-Zweig nur OHNE gültige Sitzung. Der Zuschnitt ist hier
    // eng: validateForBoard lässt ausschließlich ein Token DIESES Boards durch - ein Token der
    // Nachbaranzeige und ein Posten-Token fallen mit derselben Antwort heraus.
    val authorized = sessionAuthorized || TimingDeviceTokenService.validateForBoard(token, eventId, boardId)
        .unsafeRunSync(env).fold(
            onSuccess = { true },
            onError = { error ->
                logger.info { "Rejecting board ws handshake for board $boardId: $error" }
                false
            },
            onDefect = { defect ->
                logger.warn(defect) { "Rejecting board ws handshake for board $boardId: device token check failed" }
                false
            },
        )
    if (!authorized) {
        close(CloseReason(CloseReason.Codes.VIOLATED_POLICY, "Unauthorized"))
        return
    }

    // Der volle Stand sofort beim Verbinden: damit ist ein Client nach einem Funkloch allein durch
    // den Reconnect wieder aktuell und braucht keinen HTTP-Nachschlag. Lässt sich die Ansicht
    // gerade nicht bauen (unbekanntes Board, Datenbank hakt), bleibt die Verbindung trotzdem
    // stehen - die Anzeige hat ihren Sicherheitstakt, und der beantwortet ein unbekanntes Board
    // ohnehin sauberer (404) als ein geschlossener Socket.
    BoardViewBroadcaster.currentView(env, eventId, boardId)?.let { send(Frame.Text(it)) }

    val subscription = BoardViewBroadcaster.subscribe(env, eventId, boardId) { json ->
        send(Frame.Text(json))
    }
    try {
        // Clients hören nur zu; eingehende Frames werden ignoriert (Keepalive machen die
        // Ktor-Pings aus configureSockets).
        incoming.consumeEach { }
    } finally {
        BoardViewBroadcaster.unsubscribe(subscription)
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

    val sessionAuthorized = authenticateAnyWithToken(
        token,
        Privilege.UpdateAppTimingGlobal,
        Privilege.UpdateEventGlobal,
        Privilege.ReadEventGlobal,
    ).unsafeRunSync(env).fold(
        onSuccess = { true },
        onError = { false },
        onDefect = { defect ->
            logger.warn(defect) { "Rejecting timing ws handshake for event $eventId: authentication failed" }
            false
        },
    )

    // Kein gültiger Sitzungstoken? Dann kann der Token-Slot des Subprotokolls auch ein
    // Geräte-Token tragen: geteilte Posten-Links (Erfassung/Startbildschirm) laufen ohne
    // Anmeldung und brauchen den Live-Kanal trotzdem. Dieselben Tokens wie beim
    // Zeitmarken-POST, dieselbe Widerrufbarkeit über den Leitstand-Geräte-Reiter.
    val authorized = sessionAuthorized || TimingDeviceTokenService.validateForEvent(token, eventId)
        .unsafeRunSync(env).fold(
            onSuccess = { true },
            onError = { error ->
                logger.info { "Rejecting timing ws handshake for event $eventId: $error" }
                false
            },
            onDefect = { defect ->
                logger.warn(defect) { "Rejecting timing ws handshake for event $eventId: device token check failed" }
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
