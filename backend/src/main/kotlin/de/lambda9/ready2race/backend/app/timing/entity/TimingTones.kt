package de.lambda9.ready2race.backend.app.timing.entity

import de.lambda9.ready2race.backend.validation.ValidationResult

/**
 * Ein Eintrag des Tonplans eines Zeitnahmetyps: WELCHER Sinus-Piep WANN relativ zum Start des
 * jeweiligen Boots/der Welle gespielt wird. [offsetMillis] negativ = vor dem Start, 0 = der Start
 * selbst; positive Werte sind nicht erlaubt - nach dem Start wandert das Countdown-Ziel sofort
 * zum nächsten Boot, ein Ton "nach dem Start" wäre je Boot mehrdeutig.
 */
data class TonePlanStep(
    val offsetMillis: Int,
    val frequencyHz: Int,
    val durationMillis: Int,
)

/**
 * Der Bestätigungston beim Erfassen am FINISH- bzw. SPLIT-Posten (Höhe/Dauer), je Postentyp
 * getrennt an der Veranstaltung abgelegt. null in der Datenbank = eingebauter Standard
 * ([TimingToneLimits.DEFAULT_CAPTURE_TONE]).
 */
data class CaptureTone(
    val frequencyHz: Int,
    val durationMillis: Int,
)

/**
 * Grenzen und Vorgaben der Zeitnahme-Töne - EINE Stelle für Request-Validierung und
 * Einstellungs-Auflösung; das Frontend prüft dieselben Werte in seinen Formularen.
 *
 * Frequenz 100..4000 Hz: darunter tragen kleine Lautsprecher nicht, darüber wird es unangenehm.
 * Dauer 20..2000 ms: kürzer ist kein hörbarer Piep mehr, länger überlappte den Sekundentakt.
 * Offset -600000..0 ms: die Untergrenze entspricht dem größten erlaubten Sequenz-Vorlauf
 * (leadInMillis <= 600000, siehe CreateSequenceRequest). Höchstens 30 Einträge je Plan.
 */
object TimingToneLimits {

    const val MAX_PLAN_STEPS = 30
    const val FREQUENCY_MIN_HZ = 100
    const val FREQUENCY_MAX_HZ = 4000
    const val DURATION_MIN_MILLIS = 20
    const val DURATION_MAX_MILLIS = 2000
    const val OFFSET_MIN_MILLIS = -600_000
    const val OFFSET_MAX_MILLIS = 0

    /** Der bisherige Erfassungs-Piep (880 Hz / 150 ms) - unkonfiguriert klingt nichts anders. */
    val DEFAULT_CAPTURE_TONE = CaptureTone(frequencyHz = 880, durationMillis = 150)

    private fun validateFrequency(value: Int, field: String): ValidationResult =
        if (value < FREQUENCY_MIN_HZ || value > FREQUENCY_MAX_HZ) {
            ValidationResult.Invalid.Message { "$field.frequencyHz must be between $FREQUENCY_MIN_HZ and $FREQUENCY_MAX_HZ" }
        } else {
            ValidationResult.Valid
        }

    private fun validateDuration(value: Int, field: String): ValidationResult =
        if (value < DURATION_MIN_MILLIS || value > DURATION_MAX_MILLIS) {
            ValidationResult.Invalid.Message { "$field.durationMillis must be between $DURATION_MIN_MILLIS and $DURATION_MAX_MILLIS" }
        } else {
            ValidationResult.Valid
        }

    /** null ist gültig und bedeutet "eingebauter Standardplan". */
    fun validateTonePlan(plan: List<TonePlanStep>?, field: String): ValidationResult {
        if (plan == null) return ValidationResult.Valid
        if (plan.size > MAX_PLAN_STEPS) {
            return ValidationResult.Invalid.Message { "$field must not contain more than $MAX_PLAN_STEPS steps" }
        }
        return ValidationResult.allOf(
            *plan.mapIndexed { index, step ->
                val stepField = "$field[$index]"
                ValidationResult.allOf(
                    if (step.offsetMillis < OFFSET_MIN_MILLIS || step.offsetMillis > OFFSET_MAX_MILLIS) {
                        ValidationResult.Invalid.Message { "$stepField.offsetMillis must be between $OFFSET_MIN_MILLIS and $OFFSET_MAX_MILLIS" }
                    } else {
                        ValidationResult.Valid
                    },
                    validateFrequency(step.frequencyHz, stepField),
                    validateDuration(step.durationMillis, stepField),
                )
            }.toTypedArray()
        )
    }

    /** null ist gültig und bedeutet "eingebauter Standardton". */
    fun validateCaptureTone(tone: CaptureTone?, field: String): ValidationResult =
        if (tone == null) {
            ValidationResult.Valid
        } else {
            ValidationResult.allOf(
                validateFrequency(tone.frequencyHz, field),
                validateDuration(tone.durationMillis, field),
            )
        }
}
