package de.lambda9.ready2race.backend.app.timing.entity

import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult
import de.lambda9.ready2race.backend.validation.validate
import de.lambda9.ready2race.backend.validation.validators.StringValidators.notBlank
import de.lambda9.ready2race.backend.validation.validators.Validator

data class TimingRaceTypeRequest(
    val name: String,
    val timed: Boolean,
    val startMode: SequenceMode,
    val intervalMillis: Long?,
    val leadInMillis: Long?,
    val sorting: Int,
) : Validatable {

    override fun validate(): ValidationResult = ValidationResult.allOf(
        this::name validate notBlank,
        this::intervalMillis validate intervalBounds,
        this::leadInMillis validate leadInBounds,
    )

    // Unlike CreateSequenceRequest, an INTERVAL race type may leave the cadence open: the race type
    // is a preset, and "Einzelstart, Abstand entscheidet der Starter" is a legitimate one. What it
    // must not do is carry a cadence too short to count down against.
    private val intervalBounds: Validator<Long?>
        get() = Validator { value ->
            when {
                value == null -> ValidationResult.Valid
                value < CreateSequenceRequest.MIN_INTERVAL_MILLIS ->
                    ValidationResult.Invalid.Message { "is less than ${CreateSequenceRequest.MIN_INTERVAL_MILLIS}" }

                else -> ValidationResult.Valid
            }
        }

    // Same bounds the sequence itself enforces - a preset that the sequence would reject would be a
    // trap the operator only discovers at the start line.
    private val leadInBounds: Validator<Long?>
        get() = Validator { value ->
            when {
                value == null -> ValidationResult.Valid
                value < CreateSequenceRequest.MIN_LEAD_IN_MILLIS ->
                    ValidationResult.Invalid.Message { "is less than ${CreateSequenceRequest.MIN_LEAD_IN_MILLIS}" }

                value > CreateSequenceRequest.MAX_LEAD_IN_MILLIS ->
                    ValidationResult.Invalid.Message { "is greater than ${CreateSequenceRequest.MAX_LEAD_IN_MILLIS}" }

                else -> ValidationResult.Valid
            }
        }

    companion object {
        val example
            get() = TimingRaceTypeRequest(
                name = "Zeitfahren",
                timed = true,
                startMode = SequenceMode.INTERVAL,
                intervalMillis = 60000,
                leadInMillis = 60000,
                sorting = 0,
            )
    }
}
