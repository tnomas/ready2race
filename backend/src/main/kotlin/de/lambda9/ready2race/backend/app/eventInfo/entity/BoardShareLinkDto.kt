package de.lambda9.ready2race.backend.app.eventInfo.entity

import java.util.UUID

/**
 * Antwort des Board-Share-Link-Endpunkts: die fertige Anzeigen-Adresse, hinter der automatisch
 * ein Geräte-Token steht.
 *
 * Warum überhaupt ein Link mit Token: seit die Board-Endpunkte eine Authentifizierung verlangen,
 * kann ein montierter Bildschirm oder eine OBS-Quelle seine Anzeige nicht mehr einfach aufrufen -
 * anmelden kann er sich aber auch nicht. Also bekommt er dasselbe, was die Zeitnahme-Posten
 * längst haben: einen Link, der das Geräte-Token trägt.
 *
 * [path] ist wurzelrelativ (`/board/{eventId}/{boardId}?token=...`) - das Backend kennt den
 * öffentlichen Origin nicht, die Oberfläche stellt `window.location.origin` voran (dieselbe
 * Adressbildung wie beim Posten-Link). [token] liegt zusätzlich einzeln bei, falls die Oberfläche
 * den Link anders zusammensetzen will.
 *
 * Wiederholbar wie der Posten-Link: derselbe Klick liefert denselben Link, bis das Token
 * widerrufen wird. [deviceTokenId] ist der Griff dafür - dieselbe Widerrufsroute wie bei den
 * Posten-Tokens (`DELETE /event/{eventId}/timing/deviceTokens/{tokenId}`), denn es ist dieselbe
 * Token-Infrastruktur (Migration V202608250900).
 *
 * Bewusst NICHT der `TimingDeviceTokenDto`: der führt einen Posten und wäre für ein Board
 * gelogen.
 */
data class BoardShareLinkDto(
    val deviceTokenId: UUID,
    val board: UUID,
    val token: String,
    val path: String,
)
