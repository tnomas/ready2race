package de.lambda9.ready2race.backend.app.timing.entity

/**
 * Antwort des Share-Link-Endpunkts: der fertige Posten-Link, hinter dem automatisch ein
 * Geräte-Token steht.
 *
 * [path] ist wurzelrelativ (`/event/{eventId}/timing/{stationId}?token=...`, bei ANZEIGE mit
 * `/anzeige`) - das Backend kennt den öffentlichen Origin nicht, die Oberfläche stellt
 * `window.location.origin` voran (dieselbe Adressbildung wie die Board-Links). [token] liegt
 * zusätzlich einzeln bei, falls die Oberfläche den Link anders zusammensetzen will.
 *
 * Anders als beim manuell ausgestellten Hardware-Token ist diese Antwort wiederholbar: derselbe
 * Posten liefert denselben Link, bis das Token im Geräte-Reiter widerrufen wird.
 */
data class TimingShareLinkDto(
    val deviceToken: TimingDeviceTokenDto,
    val token: String,
    val path: String,
)
