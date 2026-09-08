package de.lambda9.ready2race.backend.app.eventInfo.boundary

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.timing.control.TimingDeviceTokenRepo
import de.lambda9.tailwind.core.extensions.kio.orDie
import java.security.MessageDigest
import java.util.UUID

/**
 * Löst ein vorgezeigtes Geräte-Token (Klartext) auf die Kennung seiner Zeile auf - für die
 * Push-Kanäle, die ihre Verbindung an das Token binden müssen, damit ein Widerruf sie schließen
 * kann (siehe `plugins/Sockets.kt`).
 *
 * Die Prüfung, OB das Token gilt (Veranstaltung, Ziel, Widerruf), bleibt bei den
 * `validate*`-Funktionen von [de.lambda9.ready2race.backend.app.timing.boundary.TimingDeviceTokenService];
 * die geben aber nur "gültig" zurück, nicht die Zeile. Bis sie den Datensatz liefern, bildet
 * diese Stelle denselben Hash (SHA-256, hex, ungesalzen - so ist er per Index auffindbar) und
 * liest die Zeile über die vorhandene Repo-Funktion. Aufgerufen wird sie ausschließlich NACH einer
 * erfolgreichen Validierung.
 */
object DeviceTokenLookup {

    fun tokenId(plainToken: String): App<Nothing, UUID?> =
        TimingDeviceTokenRepo.getByHash(hash(plainToken)).orDie().map { it?.id }

    private fun hash(plain: String): String =
        MessageDigest.getInstance("SHA-256")
            .digest(plain.toByteArray(Charsets.UTF_8))
            .joinToString("") { byte -> "%02x".format(byte) }
}
