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
    /**
     * Ausklingzeit in ms (0-5000): wie flach die Lautstärke nach der Nenndauer abfällt. Mit
     * Ausklingzeit ist [durationMillis] die HALTEZEIT bei voller Lautstärke, der Abfall kommt
     * obendrauf (Gesamtklang = duration + release) und darf die Nenndauer überragen. null (oder
     * 0) = die bisherige Hüllkurve: exponentieller Abfall über die gesamte Nenndauer.
     */
    val releaseMillis: Int? = null,
)

/**
 * Ein einzelner konfigurierbarer Ton der Veranstaltung (Höhe/Dauer/Ausklingen): der
 * Bestätigungston beim Erfassen am FINISH- bzw. SPLIT-Posten und der Fehlstart-Ton der
 * Startposten, jeweils als eigene jsonb-Spalte am Event. null in der Datenbank = eingebauter
 * Standard ([TimingToneLimits.DEFAULT_CAPTURE_TONE] bzw.
 * [TimingToneLimits.DEFAULT_FALSE_START_TONE]).
 */
data class CaptureTone(
    val frequencyHz: Int,
    val durationMillis: Int,
    /** Ausklingzeit wie bei [TonePlanStep.releaseMillis]; null = bisherige Hüllkurve. */
    val releaseMillis: Int? = null,
)

/**
 * Grenzen und Vorgaben der Zeitnahme-Töne - EINE Stelle für Request-Validierung und
 * Einstellungs-Auflösung; das Frontend prüft dieselben Werte in seinen Formularen.
 *
 * Frequenz 100..4000 Hz: darunter tragen kleine Lautsprecher nicht, darüber wird es unangenehm.
 * Dauer 20..10000 ms: kürzer ist kein hörbarer Piep mehr; die Obergrenze war früher 2000 ms
 * (nicht in den Sekundentakt hineinragen), aber der lange Fehlstart-Ton braucht mehr - wer im
 * Tonplan selbst einen 10-Sekünder konfiguriert, tut das jetzt bewusst.
 * Ausklingen 0..5000 ms: 0/null = die bisherige Hüllkurve (Abfall über die Nenndauer).
 * Offset -600000..0 ms: die Untergrenze entspricht dem größten erlaubten Sequenz-Vorlauf
 * (leadInMillis <= 600000, siehe CreateSequenceRequest). Höchstens 30 Einträge je Plan.
 */
object TimingToneLimits {

    const val MAX_PLAN_STEPS = 30
    const val FREQUENCY_MIN_HZ = 100
    const val FREQUENCY_MAX_HZ = 4000
    const val DURATION_MIN_MILLIS = 20
    const val DURATION_MAX_MILLIS = 10_000
    const val RELEASE_MIN_MILLIS = 0
    const val RELEASE_MAX_MILLIS = 5000
    const val OFFSET_MIN_MILLIS = -600_000
    const val OFFSET_MAX_MILLIS = 0

    /** Der bisherige Erfassungs-Piep (880 Hz / 150 ms) - unkonfiguriert klingt nichts anders. */
    val DEFAULT_CAPTURE_TONE = CaptureTone(frequencyHz = 880, durationMillis = 150)

    /**
     * Der eingebaute Fehlstart-Ton: deutlich länger und tiefer als Countdown-Ticks (600 Hz) und
     * Startton (900 Hz), damit er am Wasser sofort als "zurück!" erkennbar ist. 440 Hz / 3000 ms
     * ohne eigene Ausklingzeit = die Lautstärke fällt über die vollen 3 Sekunden exponentiell ab.
     */
    val DEFAULT_FALSE_START_TONE = CaptureTone(frequencyHz = 440, durationMillis = 3000)

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

    /** null ist gültig ("bisherige Hüllkurve"); ein gesetzter Wert muss in 0..5000 ms liegen. */
    private fun validateRelease(value: Int?, field: String): ValidationResult =
        if (value != null && (value < RELEASE_MIN_MILLIS || value > RELEASE_MAX_MILLIS)) {
            ValidationResult.Invalid.Message { "$field.releaseMillis must be between $RELEASE_MIN_MILLIS and $RELEASE_MAX_MILLIS" }
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
                    validateRelease(step.releaseMillis, stepField),
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
                validateRelease(tone.releaseMillis, field),
            )
        }
}
