package de.lambda9.ready2race.backend.app.timing.entity

import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult
import de.lambda9.ready2race.backend.validation.validate
import de.lambda9.ready2race.backend.validation.validators.IntValidators
import de.lambda9.ready2race.backend.validation.validators.StringValidators.notBlank

data class TimingModeRequest(
    val name: String,
    val withLaps: Boolean,
    val startGrouping: TimingStartGrouping,
    val intervalSeconds: Int?,
    val leadInSeconds: Int,
    /** null = eingebauter Standardplan; Grenzen siehe [TimingToneLimits]. */
    val tonePlan: List<ToneStep>?,
) : Validatable {

    override fun validate(): ValidationResult = ValidationResult.allOf(
        this::name validate notBlank,
        // Ein Intervall von 0 hieße "alle sofort" - das ist der Massenstart (WELLE ohne
        // Intervall), kein Intervallstart. Deshalb mindestens 1 Sekunde.
        this::intervalSeconds validate IntValidators.min(1),
        this::leadInSeconds validate IntValidators.notNegative,
        TimingToneLimits.validateTonePlan(tonePlan, "tonePlan"),
    )

    companion object {
        val example
            get() = TimingModeRequest(
                name = "Timetrial 30s",
                withLaps = false,
                startGrouping = TimingStartGrouping.EINZEL,
                intervalSeconds = 30,
                leadInSeconds = 10,
                tonePlan = null,
            )
    }
}
