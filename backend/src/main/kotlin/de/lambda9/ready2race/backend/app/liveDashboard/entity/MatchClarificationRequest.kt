package de.lambda9.ready2race.backend.app.liveDashboard.entity

import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult
import de.lambda9.ready2race.backend.validation.validate
import de.lambda9.ready2race.backend.validation.validators.StringValidators.notBlank

/**
 * Ein Lauf wird in Klärung gesetzt. Mehr als den Grund gibt es nicht anzugeben - den Zeitpunkt
 * setzt der Server.
 *
 * [reason] ist Pflicht: hier durch den Validator, in der Datenbank noch einmal durch
 * `check (btrim(clarification_reason) <> '')`. Der Grund steht auf der eingeklappten Zeile im
 * Schiedsrichter-Dashboard - ohne ihn wüsste beim Schichtwechsel niemand mehr, worum gestritten
 * wird.
 */
data class MatchClarificationRequest(
    val reason: String,
) : Validatable {
    override fun validate(): ValidationResult = ValidationResult.allOf(
        this::reason validate notBlank,
    )

    companion object {
        val example
            get() = MatchClarificationRequest(
                reason = "Einspruch RV Hansa, Bahnberührung",
            )
    }
}
