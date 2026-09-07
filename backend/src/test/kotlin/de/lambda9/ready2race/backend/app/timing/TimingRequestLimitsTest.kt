package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.timing.entity.CreateSequenceRequest
import de.lambda9.ready2race.backend.app.timing.entity.CreateTimeMarkRequest
import de.lambda9.ready2race.backend.app.timing.entity.SequenceMode
import de.lambda9.ready2race.backend.validation.ValidationResult
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

/**
 * Eingabegrenzen der Zeitnahme-Requests - reine Validierung ohne Datenbank.
 *
 * Eine Zeitmarke trägt den Zeitstempel des Geräts. Ein Gerät mit völlig verstellter Uhr (oder ein
 * Aufruf mit einem Zufallswert) dürfte sonst Marken in fernen Jahren setzen, die die
 * Zeitenlisten sortieren und in die offiziellen Zeiten einfließen. Ein Tag Spielraum in beide
 * Richtungen deckt jede plausible Uhrabweichung und die Offline-Warteschlange der Helfer-App.
 */
class TimingRequestLimitsTest {

    @Test
    fun timeMarkNowIsValid() {
        assertEquals(ValidationResult.Valid, mark(System.currentTimeMillis()).validate())
    }

    @Test
    fun timeMarkJustInsideTheWindowIsValid() {
        val margin = 60_000L
        assertEquals(
            ValidationResult.Valid,
            mark(System.currentTimeMillis() - CreateTimeMarkRequest.MAX_CLOCK_SKEW_MILLIS + margin).validate(),
        )
        assertEquals(
            ValidationResult.Valid,
            mark(System.currentTimeMillis() + CreateTimeMarkRequest.MAX_CLOCK_SKEW_MILLIS - margin).validate(),
        )
    }

    @Test
    fun timeMarkMoreThanADayInThePastIsInvalid() {
        val tooOld = System.currentTimeMillis() - CreateTimeMarkRequest.MAX_CLOCK_SKEW_MILLIS - 1_000
        assertIs<ValidationResult.Invalid>(mark(tooOld).validate())
    }

    @Test
    fun timeMarkMoreThanADayInTheFutureIsInvalid() {
        val tooNew = System.currentTimeMillis() + CreateTimeMarkRequest.MAX_CLOCK_SKEW_MILLIS + 1_000
        assertIs<ValidationResult.Invalid>(mark(tooNew).validate())
    }

    @Test
    fun clockSkewWindowIsOneDay() {
        assertEquals(86_400_000L, CreateTimeMarkRequest.MAX_CLOCK_SKEW_MILLIS)
    }

    @Test
    fun intervalAtTheMaximumIsValid() {
        assertEquals(ValidationResult.Valid, sequence(CreateSequenceRequest.MAX_INTERVAL_MILLIS).validate())
    }

    @Test
    fun intervalAboveTheMaximumIsInvalid() {
        assertIs<ValidationResult.Invalid>(sequence(CreateSequenceRequest.MAX_INTERVAL_MILLIS + 1).validate())
    }

    @Test
    fun intervalMaximumIsOneHour() {
        assertEquals(3_600_000L, CreateSequenceRequest.MAX_INTERVAL_MILLIS)
    }

    private fun mark(timestampMillis: Long) = CreateTimeMarkRequest(
        id = UUID.randomUUID(),
        station = UUID.randomUUID(),
        timestampMillis = timestampMillis,
    )

    private fun sequence(intervalMillis: Long) = CreateSequenceRequest(
        station = UUID.randomUUID(),
        mode = SequenceMode.INTERVAL,
        intervalMillis = intervalMillis,
        teams = listOf(UUID.randomUUID()),
    )
}
