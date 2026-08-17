package de.lambda9.ready2race.backend.app.liveDashboard.entity

import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult
import de.lambda9.ready2race.backend.validation.validate
import de.lambda9.ready2race.backend.validation.validators.StringValidators.maxLength
import de.lambda9.ready2race.backend.validation.validators.StringValidators.notBlank

/**
 * Ein Lauf wird in Klärung gesetzt. Mehr als den Grund gibt es nicht anzugeben - den Zeitpunkt
 * setzt der Server.
 *
 * [reason] ist Pflicht: hier durch den Validator, in der Datenbank noch einmal durch
 * `check (btrim(clarification_reason) <> '')`. Der Grund steht auf der eingeklappten Zeile im
 * Schiedsrichter-Dashboard - ohne ihn wüsste beim Schichtwechsel niemand mehr, worum gestritten
 * wird.
 *
 * Die Längengrenze ist die der Spalte (`varchar(255)`). Ohne sie liefe ein zu langer Einwurf aus
 * der Zwischenablage in einen 500er aus der Datenbank statt in ein sauberes 400 mit Hinweis.
 */
data class MatchClarificationRequest(
    val reason: String,
) : Validatable {
    override fun validate(): ValidationResult = ValidationResult.allOf(
        this::reason validate notBlank,
        this::reason validate maxLength(255),
    )

    companion object {
        val example
            get() = MatchClarificationRequest(
                reason = "Einspruch RV Hansa, Bahnberührung",
            )
    }
}
