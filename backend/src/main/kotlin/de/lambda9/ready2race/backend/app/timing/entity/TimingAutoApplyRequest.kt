package de.lambda9.ready2race.backend.app.timing.entity

import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult

/**
 * PUT-Körper des Schalters „Automatische Übernahme". Das Einschalten zieht den aufgelaufenen Stand
 * einmalig nach - deshalb ist der PUT nicht rein deklarativ, sondern löst bei `enabled = true` die
 * Nachführung aus. Gelesen wird der Schalter über [TimingSettingsDto] (GET /timing/settings).
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
