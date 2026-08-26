package de.lambda9.ready2race.backend.app.timing.entity

import de.lambda9.ready2race.backend.validation.ValidationResult

/**
 * Die Tastenbelegung des Zielpostens: welche Taste welches Boot trifft, in Positionsreihenfolge.
 *
 * Zwei Reihen, weil man je nach Tastatur greift, was näher liegt - die Ziffernreihe oder die
 * Buchstaben; die zweite Reihe ist optional. Bis zum 26.08.2026 waren `1`-`6` und `A`-`F` fest
 * verdrahtet ([de.lambda9.ready2race.backend.app.timing.boundary.TimingMatchService] liefert die
 * Positionen, das Board bildete die Tasten selbst darauf ab); jetzt sind sie frei - und genau
 * deshalb müssen sie geprüft werden. Eine Belegung, die zwei Boote auf dieselbe Taste legt, fällt
 * sonst erst am Renntag auf, und dann trifft ein Tastendruck das falsche Boot.
 *
 * Vier Regeln, alle aus der Bedienung heraus:
 * - **Keine Doppelung** innerhalb einer Reihe und auch nicht zwischen den beiden Reihen: Eine
 *   Taste gehört zu genau einem Boot, sonst wäre die Zuordnung mehrdeutig.
 * - **Groß und klein sind dieselbe Taste**: Das Board liest den Tastendruck ohne Rücksicht auf
 *   die Umschalttaste - `a` und `A` dürfen also nicht auf zwei Boote zeigen.
 * - **Kein Leerzeichen**: Die Leertaste hat am Erfassungs-Board ihre eigene Bedeutung (der große
 *   Erfassungsknopf) und darf nicht zugleich ein Boot treffen.
 * - **Höchstens [MAX_KEYS] Zeichen**: mehr Positionen kann eine Partie am Zielposten nicht
 *   hergeben - dieselben sechs, die vorher fest verdrahtet waren. Alles darüber wäre eine Taste,
 *   die nie ein Boot trifft.
 */
object TimingBoatKeys {

    /** So viele Boote hat ein Lauf am Zielposten höchstens - die bisherigen Positionen 1..6. */
    const val MAX_KEYS = 6

    const val DEFAULT_PRIMARY = "123456"
    const val DEFAULT_SECONDARY = "ABCDEF"

    /**
     * Prüft beide Reihen zusammen - getrennt ginge die wichtigste Regel verloren, nämlich die
     * gegen Doppelungen ZWISCHEN den Reihen.
     *
     * [secondary] darf `null` sein („keine zweite Reihe"); ein leerer String ist dagegen ein
     * Fehler, damit „keine zweite Reihe" genau eine Schreibweise hat und nicht zwei.
     */
    fun validate(primary: String, secondary: String?, field: String): ValidationResult =
        ValidationResult.allOf(
            validateRow(primary, "$field.boatKeysPrimary"),
            if (secondary == null) ValidationResult.Valid else validateRow(secondary, "$field.boatKeysSecondary"),
            if (secondary != null && overlap(primary, secondary)) {
                ValidationResult.Invalid.Message {
                    "$field.boatKeysSecondary must not repeat a key of $field.boatKeysPrimary"
                }
            } else {
                ValidationResult.Valid
            },
        )

    private fun validateRow(row: String, field: String): ValidationResult = when {
        row.isEmpty() -> ValidationResult.Invalid.Message { "$field must not be empty" }
        row.length > MAX_KEYS -> ValidationResult.Invalid.Message { "$field must not contain more than $MAX_KEYS keys" }
        row.any { it.isWhitespace() } -> ValidationResult.Invalid.Message { "$field must not contain whitespace" }
        normalize(row).toSet().size != row.length ->
            ValidationResult.Invalid.Message { "$field must not contain the same key twice" }

        else -> ValidationResult.Valid
    }

    private fun overlap(primary: String, secondary: String): Boolean =
        normalize(primary).toSet().intersect(normalize(secondary).toSet()).isNotEmpty()

    private fun normalize(row: String): String = row.uppercase()
}
