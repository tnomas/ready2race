package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.timing.entity.TimingModeRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingStartGrouping
import de.lambda9.ready2race.backend.app.timing.entity.TimingToneLimits
import de.lambda9.ready2race.backend.app.timing.entity.TonePlanStep
import de.lambda9.ready2race.backend.validation.ValidationResult
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Die Grenzen des Tonplans (Anzahl, Frequenz, Dauer, Offset) am Request geprüft - dieselben
 * Werte prüft das Frontend-Formular, hier steht die verbindliche Server-Seite.
 */
class TimingToneLimitsTest {

    private fun request(tonePlan: List<TonePlanStep>?) = TimingModeRequest(
        name = "Timetrial 30s",
        withLaps = false,
        startGrouping = TimingStartGrouping.EINZEL,
        intervalSeconds = 30,
        leadInSeconds = 10,
        tonePlan = tonePlan,
    )

    private fun step(
        offsetMillis: Int = -1000,
        frequencyHz: Int = 600,
        durationMillis: Int = 100,
    ) = TonePlanStep(offsetMillis, frequencyHz, durationMillis)

    @Test
    fun nullMeansBuiltInDefaultAndIsValid() {
        assertEquals(ValidationResult.Valid, request(null).validate())
    }

    @Test
    fun aPlanOnTheEdgesIsValid() {
        val plan = listOf(
            step(offsetMillis = TimingToneLimits.OFFSET_MIN_MILLIS, frequencyHz = TimingToneLimits.FREQUENCY_MIN_HZ, durationMillis = TimingToneLimits.DURATION_MIN_MILLIS),
            step(offsetMillis = TimingToneLimits.OFFSET_MAX_MILLIS, frequencyHz = TimingToneLimits.FREQUENCY_MAX_HZ, durationMillis = TimingToneLimits.DURATION_MAX_MILLIS),
        )
        assertEquals(ValidationResult.Valid, request(plan).validate())
    }

    @Test
    fun positiveOffsetsAreRejected() {
        // Nach dem Start wandert das Countdown-Ziel sofort zum nächsten Boot - ein Ton "nach dem
        // Start" wäre mehrdeutig, deshalb ist 0 die harte Obergrenze.
        assertTrue(request(listOf(step(offsetMillis = 1))).validate() is ValidationResult.Invalid)
    }

    @Test
    fun offsetsBelowTheLeadInMaximumAreRejected() {
        assertTrue(request(listOf(step(offsetMillis = TimingToneLimits.OFFSET_MIN_MILLIS - 1))).validate() is ValidationResult.Invalid)
    }

    @Test
    fun frequenciesOutsideTheAudibleWindowAreRejected() {
        assertTrue(request(listOf(step(frequencyHz = TimingToneLimits.FREQUENCY_MIN_HZ - 1))).validate() is ValidationResult.Invalid)
        assertTrue(request(listOf(step(frequencyHz = TimingToneLimits.FREQUENCY_MAX_HZ + 1))).validate() is ValidationResult.Invalid)
    }

    @Test
    fun durationsOutsideTheLimitsAreRejected() {
        assertTrue(request(listOf(step(durationMillis = TimingToneLimits.DURATION_MIN_MILLIS - 1))).validate() is ValidationResult.Invalid)
        assertTrue(request(listOf(step(durationMillis = TimingToneLimits.DURATION_MAX_MILLIS + 1))).validate() is ValidationResult.Invalid)
    }

    @Test
    fun moreThanThirtyStepsAreRejected() {
        val plan = (1..TimingToneLimits.MAX_PLAN_STEPS + 1).map { step(offsetMillis = -it * 100) }
        assertTrue(request(plan).validate() is ValidationResult.Invalid)
        assertEquals(
            ValidationResult.Valid,
            request(plan.take(TimingToneLimits.MAX_PLAN_STEPS)).validate(),
        )
    }
}
