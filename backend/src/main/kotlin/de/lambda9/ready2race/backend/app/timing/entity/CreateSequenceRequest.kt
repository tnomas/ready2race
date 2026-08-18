package de.lambda9.ready2race.backend.app.timing.entity

import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult
import de.lambda9.ready2race.backend.validation.validate
import de.lambda9.ready2race.backend.validation.validators.CollectionValidators.noDuplicates
import de.lambda9.ready2race.backend.validation.validators.CollectionValidators.notEmpty
import de.lambda9.ready2race.backend.validation.validators.Validator
import java.util.UUID

data class CreateSequenceRequest(
    val station: UUID,
    val mode: SequenceMode,
    val intervalMillis: Long?,
    /** Ordered: index in this list becomes the entry position and therefore the start slot. */
    val teams: List<UUID>,
    /**
     * Countdown before the first entry fires, in milliseconds. When absent, the service defaults it
     * to [intervalMillis] for mode INTERVAL (one full cadence, mirroring the cadence itself) or
     * [DEFAULT_MASS_LEAD_IN_MILLIS] for MASS. When given, must leave enough room for a countdown
     * with its beeps ([MIN_LEAD_IN_MILLIS]) without being unreasonably long ([MAX_LEAD_IN_MILLIS]).
     */
    val leadInMillis: Long? = null,
) : Validatable {

    override fun validate(): ValidationResult = ValidationResult.allOf(
        this::teams validate notEmpty,
        this::teams validate noDuplicates,
        this::intervalMillis validate intervalForMode,
        this::leadInMillis validate leadInBounds,
    )

    // Cross-field: only INTERVAL sequences have a cadence, and anything below a second would make
    // the countdown (and its beeps) meaningless.
    private val intervalForMode: Validator<Long?>
        get() = Validator { value ->
            when (mode) {
                SequenceMode.INTERVAL -> when {
                    value == null -> ValidationResult.Invalid.Message { "is required for mode INTERVAL" }
                    value < MIN_INTERVAL_MILLIS -> ValidationResult.Invalid.Message { "is less than $MIN_INTERVAL_MILLIS" }
                    else -> ValidationResult.Valid
                }

                SequenceMode.MASS -> ValidationResult.Valid
            }
        }

    // Optional: absent means "let the service pick the default". When given, it must still leave
    // room for a countdown with its beeps, and not run away to something absurd.
    private val leadInBounds: Validator<Long?>
        get() = Validator { value ->
            when {
                value == null -> ValidationResult.Valid
                value < MIN_LEAD_IN_MILLIS -> ValidationResult.Invalid.Message { "is less than $MIN_LEAD_IN_MILLIS" }
                value > MAX_LEAD_IN_MILLIS -> ValidationResult.Invalid.Message { "is greater than $MAX_LEAD_IN_MILLIS" }
                else -> ValidationResult.Valid
            }
        }

    companion object {
        const val MIN_INTERVAL_MILLIS = 1000L
        const val MIN_LEAD_IN_MILLIS = 3000L
        const val MAX_LEAD_IN_MILLIS = 600000L
        const val DEFAULT_MASS_LEAD_IN_MILLIS = 10000L

        val example
            get() = CreateSequenceRequest(
                station = UUID.randomUUID(),
                mode = SequenceMode.INTERVAL,
                intervalMillis = 60000,
                teams = listOf(UUID.randomUUID(), UUID.randomUUID()),
                leadInMillis = 60000,
            )
    }
}
