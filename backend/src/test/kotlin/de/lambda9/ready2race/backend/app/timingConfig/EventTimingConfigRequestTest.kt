package de.lambda9.ready2race.backend.app.timingConfig

import de.lambda9.ready2race.backend.app.timing.entity.CaptureTone
import de.lambda9.ready2race.backend.app.timing.entity.ToneWaveform
import de.lambda9.ready2race.backend.app.timingConfig.entity.EventTimingConfigRequest
import de.lambda9.ready2race.backend.app.timingConfig.entity.TimingPrecision
import de.lambda9.ready2race.backend.app.timingConfig.entity.TimingSystem
import de.lambda9.ready2race.backend.validation.ValidationResult
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Die Validierung der Abruf-Einstellungen. Sie soll den Tippfehler beim Bearbeiten abfangen — die
 * harte Untergrenze im Job (RaceClockerPollLogic.intervalSeconds) bleibt trotzdem bestehen, weil
 * Werte auch auf anderem Weg in die Datenbank kommen können.
 */
class EventTimingConfigRequestTest {

    private fun request(
        intervalActiveSeconds: Int = 5,
        intervalUpcomingSeconds: Int = 60,
        watchBeforeMinutes: Int = 15,
        watchAfterMinutes: Int = 120,
        finishTone: CaptureTone? = null,
        splitTone: CaptureTone? = null,
        falseStartTone: CaptureTone? = null,
    ) = EventTimingConfigRequest(
        timingSystem = TimingSystem.RACECLOCKER,
        startlistConfig = null,
        resultImportConfig = null,
        autoPull = true,
        intervalActiveSeconds = intervalActiveSeconds,
        intervalUpcomingSeconds = intervalUpcomingSeconds,
        watchBeforeMinutes = watchBeforeMinutes,
        watchAfterMinutes = watchAfterMinutes,
        timingPrecision = TimingPrecision.ZEHNTEL,
        finishTone = finishTone,
        splitTone = splitTone,
        falseStartTone = falseStartTone,
    )

    @Test
    fun theDefaultsAreValid() {
        assertEquals(ValidationResult.Valid, request().validate())
    }

    @Test
    fun anIntervalBelowTheFloorIsRejected() {
        assertTrue(request(intervalActiveSeconds = 1).validate() is ValidationResult.Invalid)
        assertTrue(request(intervalUpcomingSeconds = 0).validate() is ValidationResult.Invalid)
    }

    @Test
    fun negativeWindowsAreRejected() {
        assertTrue(request(watchBeforeMinutes = -1).validate() is ValidationResult.Invalid)
        assertTrue(request(watchAfterMinutes = -1).validate() is ValidationResult.Invalid)
    }

    @Test
    fun aWindowOfZeroMinutesIsAllowed() {
        assertEquals(ValidationResult.Valid, request(watchBeforeMinutes = 0, watchAfterMinutes = 0).validate())
    }

    // ---------------------------------------------------------------- Erfassungstöne

    @Test
    fun captureTonesInsideTheLimitsAreValid() {
        assertEquals(
            ValidationResult.Valid,
            request(
                finishTone = CaptureTone(frequencyHz = 100, durationMillis = 20),
                // Obergrenze seit dem Fehlstart-Ton: 10 s statt frueher 2 s.
                splitTone = CaptureTone(frequencyHz = 4000, durationMillis = 10_000),
                // Wellenform samt Ausklingzeit: die Dimensionen sind unabhaengig und beide optional.
                falseStartTone = CaptureTone(frequencyHz = 440, durationMillis = 3000, releaseMillis = 5000, waveform = ToneWaveform.TRIANGLE),
            ).validate(),
        )
    }

    @Test
    fun captureTonesOutsideTheLimitsAreRejected() {
        assertTrue(request(finishTone = CaptureTone(99, 150)).validate() is ValidationResult.Invalid)
        assertTrue(request(finishTone = CaptureTone(4001, 150)).validate() is ValidationResult.Invalid)
        assertTrue(request(splitTone = CaptureTone(880, 19)).validate() is ValidationResult.Invalid)
        assertTrue(request(splitTone = CaptureTone(880, 10_001)).validate() is ValidationResult.Invalid)
    }

    // ---------------------------------------------------------------- Fehlstart-Ton + Ausklingen

    @Test
    fun falseStartToneFollowsTheSameLimits() {
        assertTrue(request(falseStartTone = CaptureTone(99, 3000)).validate() is ValidationResult.Invalid)
        assertTrue(request(falseStartTone = CaptureTone(440, 10_001)).validate() is ValidationResult.Invalid)
        assertEquals(ValidationResult.Valid, request(falseStartTone = CaptureTone(440, 3000)).validate())
    }

    @Test
    fun releaseOutsideZeroToFiveSecondsIsRejected() {
        assertTrue(
            request(finishTone = CaptureTone(880, 150, releaseMillis = -1)).validate() is ValidationResult.Invalid,
        )
        assertTrue(
            request(falseStartTone = CaptureTone(440, 3000, releaseMillis = 5001)).validate() is ValidationResult.Invalid,
        )
        // Das Ausklingen darf die Nenndauer ueberragen (Haltezeit 150 ms + 5 s Abfall).
        assertEquals(
            ValidationResult.Valid,
            request(finishTone = CaptureTone(880, 150, releaseMillis = 5000)).validate(),
        )
    }
}
