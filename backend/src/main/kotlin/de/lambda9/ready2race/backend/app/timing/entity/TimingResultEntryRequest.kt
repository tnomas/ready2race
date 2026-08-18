package de.lambda9.ready2race.backend.app.timing.entity

import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult
import de.lambda9.ready2race.backend.validation.validate
import de.lambda9.ready2race.backend.validation.validators.Validator

/**
 * The judged part of a result, entered in the timing Leitstand: a penalty and/or a DNS/DNF/DSQ.
 *
 * PUT semantics - every field is replaced. An absent [penaltySeconds] clears the penalty, an absent
 * [penaltyNote] clears the note, and an absent (or [TimingResultStatus.NONE]) [resultStatus] clears
 * `failed`/`failed_reason`.
 *
 * The values land in the columns the rest of the application already reads
 * (`competition_match_team.penalty_seconds` / `penalty_note` / `failed` / `failed_reason`), which is
 * why entering a penalty here is immediately visible in every result view - but it only reaches the
 * TIME once the result is pushed, because that is when `(finish - start) + penalty` is written into
 * `timecode`.
 */
data class TimingResultEntryRequest(
    val penaltySeconds: Int? = null,
    val penaltyNote: String? = null,
    val resultStatus: TimingResultStatus? = null,
) : Validatable {

    override fun validate(): ValidationResult =
        this::penaltySeconds validate notNegative

    companion object {

        // A negative penalty would shorten a measured time - there is no race rule that does that,
        // and it would produce a final time the results flow cannot render sensibly.
        private val notNegative: Validator<Int?>
            get() = Validator { value ->
                when {
                    value == null -> ValidationResult.Valid
                    value < 0 -> ValidationResult.Invalid.Message { "is negative" }
                    else -> ValidationResult.Valid
                }
            }

        val example
            get() = TimingResultEntryRequest(
                penaltySeconds = 5,
                penaltyNote = "Bojenberührung",
                resultStatus = TimingResultStatus.NONE,
            )
    }
}
