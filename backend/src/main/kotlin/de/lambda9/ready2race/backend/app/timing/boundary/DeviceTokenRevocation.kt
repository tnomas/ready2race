package de.lambda9.ready2race.backend.app.timing.boundary

import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Meldestelle für widerrufene Geräte-Tokens.
 *
 * Die Autorisierung eines WebSockets wird beim Handshake geprüft; danach hält die Verbindung von
 * sich aus. Damit ein Widerruf trotzdem sofort wirkt, melden sich die Push-Kanäle hier an und
 * schließen ihre Verbindungen, sobald [notify] das Token nennt. Der Widerruf selbst
 * ([TimingDeviceTokenService.revoke]) kennt die Kanäle nicht - er ruft nur diese Stelle.
 *
 * Die Zuhörer laufen nach dem Commit des Widerrufs; ein Fehler in einem Zuhörer darf weder den
 * Widerruf noch die anderen Zuhörer stören.
 */
object DeviceTokenRevocation {

    private val listeners = CopyOnWriteArrayList<(UUID) -> Unit>()

    fun register(listener: (UUID) -> Unit) {
        listeners += listener
    }

    fun notify(tokenId: UUID) {
        for (listener in listeners) {
            runCatching { listener(tokenId) }
        }
    }

    /** Nur für Tests: alle Zuhörer entfernen. */
    internal fun clear() = listeners.clear()
}
