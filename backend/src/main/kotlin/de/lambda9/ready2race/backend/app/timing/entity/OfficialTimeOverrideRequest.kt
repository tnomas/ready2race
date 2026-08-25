package de.lambda9.ready2race.backend.app.timing.entity

import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult
import de.lambda9.ready2race.backend.validation.validate
import de.lambda9.ready2race.backend.validation.validators.Validator

/**
 * The manual part of an official time. PUT semantics: every field is replaced, so an absent
 * [overrideMillis] clears a previous override, an absent [penaltyMillis] resets the penalty to 0 and
 * an absent [resultStatus] resets it to [OfficialTimeResultStatus.NONE]. The computed value and the
 * dirty/pushed bookkeeping are never touched by this request.
 */
data class OfficialTimeOverrideRequest(
    val overrideMillis: Long?,
    val penaltyMillis: Long?,
    /** Freitext-Grund zur Strafe; absent räumt einen früheren Grund ab (PUT-Semantik wie oben). */
    val penaltyNote: String? = null,
    val resultStatus: OfficialTimeResultStatus?,
) : Validatable {

    override fun validate(): ValidationResult = ValidationResult.allOf(
        this::overrideMillis validate notNegative,
        this::penaltyMillis validate notNegative,
    )

    companion object {
        // A negative time or penalty has no meaning on a race result and would produce a timecode
        // the results flow cannot render sensibly.
        private val notNegative: Validator<Long?>
            get() = Validator { value ->
                when {
                    value == null -> ValidationResult.Valid
                    value < 0 -> ValidationResult.Invalid.Message { "is negative" }
                    else -> ValidationResult.Valid
                }
            }

        val example
            get() = OfficialTimeOverrideRequest(
                overrideMillis = 90000,
                penaltyMillis = 5000,
                penaltyNote = "Frühstart",
                resultStatus = OfficialTimeResultStatus.NONE,
            )
    }
}
