package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.timing.control.toCaptureTone
import de.lambda9.ready2race.backend.app.timing.control.toJsonb
import de.lambda9.ready2race.backend.app.timing.control.toTonePlan
import de.lambda9.ready2race.backend.app.timing.entity.CaptureTone
import de.lambda9.ready2race.backend.app.timing.entity.TimingModeRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingStartGrouping
import de.lambda9.ready2race.backend.app.timing.entity.TimingToneLimits
import de.lambda9.ready2race.backend.app.timing.entity.TonePlanStep
import de.lambda9.ready2race.backend.app.timing.entity.ToneWaveform
import de.lambda9.ready2race.backend.validation.ValidationResult
import org.jooq.JSONB
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
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
        releaseMillis: Int? = null,
    ) = TonePlanStep(offsetMillis, frequencyHz, durationMillis, releaseMillis)

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
    fun theDurationCeilingIsTenSeconds() {
        // Angehoben von 2000 ms, damit der lange Fehlstart-Ton (und bewusst lange Plantoene)
        // durch die Validierung kommen.
        assertEquals(10_000, TimingToneLimits.DURATION_MAX_MILLIS)
        assertEquals(ValidationResult.Valid, request(listOf(step(durationMillis = 10_000))).validate())
    }

    @Test
    fun releaseIsOptionalAndLimitedToFiveSeconds() {
        assertEquals(ValidationResult.Valid, request(listOf(step(releaseMillis = null))).validate())
        assertEquals(ValidationResult.Valid, request(listOf(step(releaseMillis = TimingToneLimits.RELEASE_MIN_MILLIS))).validate())
        // Das Ausklingen darf die Nenndauer ueberragen: 100 ms Haltezeit + 5 s Abfall.
        assertEquals(ValidationResult.Valid, request(listOf(step(releaseMillis = TimingToneLimits.RELEASE_MAX_MILLIS))).validate())
        assertTrue(request(listOf(step(releaseMillis = -1))).validate() is ValidationResult.Invalid)
        assertTrue(request(listOf(step(releaseMillis = TimingToneLimits.RELEASE_MAX_MILLIS + 1))).validate() is ValidationResult.Invalid)
    }

    @Test
    fun theBuiltInDefaultTonesAreInsideTheLimits() {
        assertEquals(ValidationResult.Valid, TimingToneLimits.validateCaptureTone(TimingToneLimits.DEFAULT_CAPTURE_TONE, "finishTone"))
        assertEquals(ValidationResult.Valid, TimingToneLimits.validateCaptureTone(TimingToneLimits.DEFAULT_FALSE_START_TONE, "falseStartTone"))
    }

    @Test
    fun theBuiltInFalseStartToneIsASawtooth() {
        // Die eine gewollte Ausnahme von "Standard bleibt Sinus": der Fehlstart-Ton ist brandneu
        // (kein Bestandsklang) und soll aggressiv klingen. 440 Hz / 3000 ms bleiben unveraendert.
        assertEquals(
            CaptureTone(frequencyHz = 440, durationMillis = 3000, waveform = ToneWaveform.SAWTOOTH),
            TimingToneLimits.DEFAULT_FALSE_START_TONE,
        )
        // Die Erfassungstoene bleiben dagegen unkonfiguriert-Sinus (waveform null).
        assertNull(TimingToneLimits.DEFAULT_CAPTURE_TONE.waveform)
    }

    @Test
    fun waveformIsOptionalAndAcceptsAllFourShapes() {
        // Das Feld validiert sich ueber den Enum-Typ selbst: fremde Werte scheitern schon beim
        // Einlesen (Jackson), die Grenzen-Pruefung muss die vier Formen nur durchlassen.
        assertEquals(ValidationResult.Valid, request(listOf(step())).validate())
        for (waveform in ToneWaveform.entries) {
            assertEquals(
                ValidationResult.Valid,
                request(listOf(step().copy(waveform = waveform))).validate(),
            )
            assertEquals(
                ValidationResult.Valid,
                TimingToneLimits.validateCaptureTone(
                    CaptureTone(frequencyHz = 440, durationMillis = 3000, waveform = waveform),
                    "falseStartTone",
                ),
            )
        }
    }

    @Test
    fun waveformSurvivesTheJsonSerialization() {
        // Der jsonb-Mapper (Conversions.kt) muss die Form als Klartext-Namen tragen.
        val plan = listOf(
            step(),
            step(offsetMillis = 0, frequencyHz = 900, durationMillis = 400, releaseMillis = 800)
                .copy(waveform = ToneWaveform.SAWTOOTH),
        )
        assertEquals(plan, plan.toJsonb().toTonePlan())
        val tone = CaptureTone(frequencyHz = 440, durationMillis = 300, waveform = ToneWaveform.SQUARE)
        assertEquals(tone, tone.toJsonb().toCaptureTone())
    }

    @Test
    fun legacyJsonWithoutWaveformReadsAsNull() {
        // Alt-Bestand aus der Zeit vor dem Feld: kein waveform-Schluessel = Sinus (null) -
        // gespeicherte Toene duerfen ihre Klanggestalt nicht aendern.
        val plan = JSONB.jsonb("""[{"offsetMillis":-1000,"frequencyHz":600,"durationMillis":100}]""")
            .toTonePlan()
        assertEquals(listOf(step(releaseMillis = null)), plan)
        assertNull(plan!!.single().waveform)
        val tone = JSONB.jsonb("""{"frequencyHz":880,"durationMillis":150,"releaseMillis":null}""")
            .toCaptureTone()
        assertEquals(CaptureTone(frequencyHz = 880, durationMillis = 150), tone)
    }

    @Test
    fun unknownWaveformValuesFailAtParseTime() {
        // Nur die vier Grundformen des OscillatorNode sind zulaessig - ein fremder Wert in der
        // jsonb-Spalte (oder im Request, dort ueber denselben Jackson-Weg) fliegt beim Einlesen.
        assertFailsWith<Exception> {
            JSONB.jsonb("""{"frequencyHz":880,"durationMillis":150,"waveform":"NOISE"}""")
                .toCaptureTone()
        }
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
