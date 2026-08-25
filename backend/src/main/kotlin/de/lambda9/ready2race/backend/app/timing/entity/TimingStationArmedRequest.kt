package de.lambda9.ready2race.backend.app.timing.entity

import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult

/**
 * PUT-Körper der Scharfschaltung eines Postens. Bewusst nur dieser eine Wert und getrennt von
 * [TimingStationRequest]: die Betriebsart setzt die Regattaleitung einmal, den Zustand kippt der
 * Zeitnehmer am Tag zwanzigmal - ein gemeinsamer Körper hieße, dass das Entschärfen die
 * Konfiguration mit überschriebe. Gelesen wird der Zustand über [TimingStationDto].
 */
data class TimingStationArmedRequest(
    val armed: Boolean,
) : Validatable {

    override fun validate(): ValidationResult = ValidationResult.Valid

    companion object {
        val example
            get() = TimingStationArmedRequest(armed = true)
    }
}
