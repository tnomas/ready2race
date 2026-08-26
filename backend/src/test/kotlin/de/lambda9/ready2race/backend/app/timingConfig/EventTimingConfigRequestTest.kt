package de.lambda9.ready2race.backend.app.timingConfig

import de.lambda9.ready2race.backend.app.timing.entity.StartDisplaySettings
import de.lambda9.ready2race.backend.app.timing.entity.TimingStartDisplayLimits
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
 *
 * Die Töne stehen seit dem 26.08.2026 nicht mehr in diesem Request, sondern im Ton-Satz der
 * Veranstaltung; ihre Grenzen prüft [de.lambda9.ready2race.backend.app.timing.TimingToneLimitsTest]
 * am `TimingToneSetRequest`.
 */
class EventTimingConfigRequestTest {

    private fun request(
        intervalActiveSeconds: Int = 5,
        intervalUpcomingSeconds: Int = 60,
        watchBeforeMinutes: Int = 15,
        watchAfterMinutes: Int = 120,
        showManualCapture: Boolean = false,
        startDisplay: StartDisplaySettings? = null,
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
        showManualCapture = showManualCapture,
        startDisplay = startDisplay,
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

    // ---------------------------------------------------------------- Startbildschirm

    private fun startDisplay(
        clockScale: Double = 1.0,
        countdownScale: Double = 1.0,
        listScale: Double = 1.0,
        followingCount: Int = 5,
    ) = StartDisplaySettings(
        showPosition = false,
        showStartNumber = true,
        showTeamName = true,
        showClubName = true,
        showAthleteNames = false,
        clockScale = clockScale,
        countdownScale = countdownScale,
        listScale = listScale,
        followingCount = followingCount,
    )

    @Test
    fun anAbsentStartDisplayIsValid() {
        // null heisst "eingebaute Vorgaben" - dieselbe PUT-Semantik, die frueher auch die Toene
        // hatten; es darf also niemals ein Pflichtfeld daraus werden.
        assertEquals(ValidationResult.Valid, request(startDisplay = null).validate())
    }

    @Test
    fun theBuiltInStartDisplayIsAValidRequestBody() {
        // Sonst koennte "Standard wiederherstellen" einen Stand erzeugen, den das Speichern
        // ablehnt - dieselbe Absicherung, die TimingToneLimitsTest fuer die eingebauten Toene
        // trifft.
        assertEquals(
            ValidationResult.Valid,
            request(startDisplay = TimingStartDisplayLimits.DEFAULT).validate(),
        )
    }

    @Test
    fun scalesOutsideHalfToTripleAreRejected() {
        assertTrue(request(startDisplay = startDisplay(clockScale = 0.49)).validate() is ValidationResult.Invalid)
        assertTrue(request(startDisplay = startDisplay(countdownScale = 3.01)).validate() is ValidationResult.Invalid)
        assertTrue(request(startDisplay = startDisplay(listScale = 0.0)).validate() is ValidationResult.Invalid)
        // Die Raender selbst sind erlaubt.
        assertEquals(
            ValidationResult.Valid,
            request(
                startDisplay = startDisplay(
                    clockScale = TimingStartDisplayLimits.SCALE_MIN,
                    countdownScale = TimingStartDisplayLimits.SCALE_MAX,
                    listScale = TimingStartDisplayLimits.SCALE_MIN,
                )
            ).validate(),
        )
    }

    @Test
    fun aNaNScaleIsRejected() {
        // JSON kennt kein NaN, aber ein Client, der 0/0 rechnet, schickt es trotzdem - und ein
        // reiner Vergleich gegen die Grenzen wuerde es durchlassen (jeder Vergleich mit NaN ist
        // false). Eine NaN-Skala macht die Anzeige unsichtbar.
        assertTrue(request(startDisplay = startDisplay(clockScale = Double.NaN)).validate() is ValidationResult.Invalid)
    }

    @Test
    fun theFollowingCountStaysBetweenZeroAndTwenty() {
        // 0 ist ein legitimer Wert und heisst "nur das aktuelle Boot" - er darf nicht als
        // "nicht gesetzt" durchfallen.
        assertEquals(
            ValidationResult.Valid,
            request(startDisplay = startDisplay(followingCount = TimingStartDisplayLimits.FOLLOWING_MIN)).validate(),
        )
        assertEquals(
            ValidationResult.Valid,
            request(startDisplay = startDisplay(followingCount = TimingStartDisplayLimits.FOLLOWING_MAX)).validate(),
        )
        assertTrue(request(startDisplay = startDisplay(followingCount = -1)).validate() is ValidationResult.Invalid)
        assertTrue(
            request(startDisplay = startDisplay(followingCount = TimingStartDisplayLimits.FOLLOWING_MAX + 1))
                .validate() is ValidationResult.Invalid,
        )
    }

    @Test
    fun theManualCaptureSwitchNeedsNoValidation() {
        // Ein reiner Schalter ohne Grenzen - der Test haelt fest, dass BEIDE Stellungen
        // speicherbar sind; die Vorgabe (verborgen) ist keine Sperre.
        assertEquals(ValidationResult.Valid, request(showManualCapture = false).validate())
        assertEquals(ValidationResult.Valid, request(showManualCapture = true).validate())
    }
}
