package de.lambda9.ready2race.backend.app.timing.entity

import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult

/**
 * Der Schalter „Automatische Übernahme" der Veranstaltung: an heißt, jede Zeitnahme-Mutation
 * schreibt die betroffenen offiziellen Zeiten sofort an die Läufe zurück; aus heißt, die
 * Berechnung läuft weiter, aber an die Läufe wird nichts geschrieben.
 */
data class TimingAutoApplyDto(
    val enabled: Boolean,
)

/**
 * PUT-Körper des Schalters. Das Einschalten zieht den aufgelaufenen Stand einmalig nach - deshalb
 * ist der PUT nicht rein deklarativ, sondern löst bei `enabled = true` die Nachführung aus.
 */
data class TimingAutoApplyRequest(
    val enabled: Boolean,
) : Validatable {

    override fun validate(): ValidationResult = ValidationResult.Valid

    companion object {
        val example
            get() = TimingAutoApplyRequest(enabled = true)
    }
}
