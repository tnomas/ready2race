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
) : Validatable {

    override fun validate(): ValidationResult = ValidationResult.allOf(
        this::teams validate notEmpty,
        this::teams validate noDuplicates,
        this::intervalMillis validate intervalForMode,
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

    companion object {
        const val MIN_INTERVAL_MILLIS = 1000L

        val example
            get() = CreateSequenceRequest(
                station = UUID.randomUUID(),
                mode = SequenceMode.INTERVAL,
                intervalMillis = 60000,
                teams = listOf(UUID.randomUUID(), UUID.randomUUID()),
            )
    }
}
