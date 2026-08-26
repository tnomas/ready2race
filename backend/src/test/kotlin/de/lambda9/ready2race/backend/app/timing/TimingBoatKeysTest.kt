package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.timing.entity.TimingBoatKeys
import de.lambda9.ready2race.backend.app.timing.entity.TimingModeRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingStartGrouping
import de.lambda9.ready2race.backend.validation.ValidationResult
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Die Tastenbelegung des Zielpostens, am Request geprüft: Eine Belegung, die zwei Boote auf
 * dieselbe Taste legt, fällt sonst erst am Renntag auf - und dann trifft ein Tastendruck das
 * falsche Boot. Deshalb ein eigener, sprechender Fehler statt eines rohen Datenbankfehlers; die
 * Datenbank kennt diese Regeln gar nicht.
 */
class TimingBoatKeysTest {

    private fun request(primary: String, secondary: String?) = TimingModeRequest(
        name = "Timetrial 30s",
        startGrouping = TimingStartGrouping.EINZEL,
        intervalSeconds = 30,
        leadInSeconds = 10,
        boatKeysPrimary = primary,
        boatKeysSecondary = secondary,
    )

    @Test
    fun `die bisherige Belegung bleibt gültig`() {
        // 1-6 und A-F waren bis zum 26.08.2026 fest verdrahtet und sind jetzt die Vorgabe - wäre
        // sie nach den neuen Regeln ungültig, könnte kein bestehender Typ mehr gespeichert werden.
        assertEquals(
            ValidationResult.Valid,
            request(TimingBoatKeys.DEFAULT_PRIMARY, TimingBoatKeys.DEFAULT_SECONDARY).validate(),
        )
        // Ohne zweite Reihe ist ebenfalls in Ordnung - sie ist optional.
        assertEquals(ValidationResult.Valid, request(TimingBoatKeys.DEFAULT_PRIMARY, null).validate())
        // Kürzer als sechs geht auch: ein Feld mit vier Bahnen braucht keine sechs Tasten.
        assertEquals(ValidationResult.Valid, request("1234", "ABCD").validate())
    }

    @Test
    fun `eine Taste doppelt innerhalb einer Reihe wird abgelehnt`() {
        assertTrue(request("112345", null).validate() is ValidationResult.Invalid)
        assertTrue(request("123456", "AABCDE").validate() is ValidationResult.Invalid)
    }

    @Test
    fun `dieselbe Taste in beiden Reihen wird abgelehnt`() {
        // Der eigentliche Grund für die Prüfung: Jede Reihe für sich ist sauber, zusammen zeigen
        // sie mit derselben Taste auf zwei verschiedene Positionen.
        assertTrue(request("123456", "1BCDEF").validate() is ValidationResult.Invalid)
    }

    @Test
    fun `Groß und klein sind dieselbe Taste`() {
        // Das Board liest den Tastendruck ohne Rücksicht auf die Umschalttaste - `a` und `A`
        // dürfen also nicht auf zwei Boote zeigen.
        assertTrue(request("aA", null).validate() is ValidationResult.Invalid)
        assertTrue(request("abc", "ABC").validate() is ValidationResult.Invalid)
    }

    @Test
    fun `das Leerzeichen ist verboten`() {
        // Die Leertaste ist am Erfassungs-Board der große Erfassungsknopf und darf nicht zugleich
        // ein Boot treffen.
        assertTrue(request("12 456", null).validate() is ValidationResult.Invalid)
        assertTrue(request("123456", "AB DEF").validate() is ValidationResult.Invalid)
    }

    @Test
    fun `mehr Tasten als Positionen werden abgelehnt`() {
        assertEquals(6, TimingBoatKeys.MAX_KEYS)
        assertTrue(request("1234567", null).validate() is ValidationResult.Invalid)
        assertTrue(request("123456", "ABCDEFG").validate() is ValidationResult.Invalid)
    }

    @Test
    fun `eine leere Reihe wird abgelehnt`() {
        // Ohne erste Reihe träfe keine Taste mehr ein Boot; eine LEERE zweite Reihe wäre eine
        // zweite Schreibweise für „es gibt keine" - dafür steht null.
        assertTrue(request("", null).validate() is ValidationResult.Invalid)
        assertTrue(request("123456", "").validate() is ValidationResult.Invalid)
    }
}
