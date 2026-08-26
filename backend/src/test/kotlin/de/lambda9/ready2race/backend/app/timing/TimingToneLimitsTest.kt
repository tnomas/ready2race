package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.timing.control.toCaptureTone
import de.lambda9.ready2race.backend.app.timing.control.toJsonb
import de.lambda9.ready2race.backend.app.timing.control.toTonePlan
import de.lambda9.ready2race.backend.app.timing.control.toToneSequence
import de.lambda9.ready2race.backend.app.timing.entity.CaptureTone
import de.lambda9.ready2race.backend.app.timing.entity.TimingToneSetRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingToneLimits
import de.lambda9.ready2race.backend.app.timing.entity.ToneStep
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

    // Geprüft wird am Ton-Satz: Seit dem 26.08.2026 trägt er den Startsequenz-Tonplan (und die
    // drei übrigen Töne), nicht mehr der Zeitnahmetyp.
    private fun request(tonePlan: List<ToneStep>?) = TimingToneSetRequest(
        name = "Laut fürs Wasser",
        sequenceTonePlan = tonePlan,
    )

    private fun step(
        offsetMillis: Int = -1000,
        frequencyHz: Int = 600,
        durationMillis: Int = 100,
        releaseMillis: Int? = null,
    ) = ToneStep(offsetMillis, frequencyHz, durationMillis, releaseMillis)

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
        assertEquals(
            ValidationResult.Valid,
            TimingToneLimits.validateToneSequence(TimingToneLimits.DEFAULT_FALSE_START_SEQUENCE, "falseStartTone"),
        )
    }

    @Test
    fun theBuiltInFalseStartSequenceIsShortShortLongOnSawtooth() {
        // Das Muster ist die Aussage: zwei kurze gleiche Toene, dann ein langer TIEFERER mit
        // Ausklingen - "kurz, kurz, lang" ist auch ueber Wind als Rueckruf erkennbar, ein
        // Einzelton nicht. Saegezahn bleibt die eine gewollte Ausnahme von "Standard ist Sinus".
        val sequence = TimingToneLimits.DEFAULT_FALSE_START_SEQUENCE
        assertEquals(3, sequence.size)
        assertTrue(sequence.all { it.waveform == ToneWaveform.SAWTOOTH })
        // Alle gehalten (releaseMillis gesetzt): ein abfallender Ton klaenge zaghaft.
        assertTrue(sequence.all { it.releaseMillis != null })
        assertEquals(listOf(0, 400, 800), sequence.map { it.offsetMillis })
        assertEquals(listOf(300, 300, 1500), sequence.map { it.durationMillis })
        // Der Schluss liegt TIEFER als die beiden kurzen - eine fallende Tonhoehe hoert sich als
        // Abschluss, eine steigende als Frage.
        assertTrue(sequence.last().frequencyHz < sequence.first().frequencyHz)
        // Die Erfassungstoene bleiben dagegen unkonfiguriert-Sinus (waveform null).
        assertNull(TimingToneLimits.DEFAULT_CAPTURE_TONE.waveform)
    }

    @Test
    fun theBuiltInFalseStartSequenceStaysAsLongAsTheOldSingleTone() {
        // Gesamtlaenge = letzter Zeitpunkt + Dauer + Ausklingen. Der alte Einzelton war 3000 ms;
        // die Folge bleibt in derselben Groessenordnung, damit sie den Startbereich nicht laenger
        // beansprucht und das Entprell-Fenster der Boards nicht sprunghaft waechst.
        val last = TimingToneLimits.DEFAULT_FALSE_START_SEQUENCE.last()
        val total = last.offsetMillis + last.durationMillis + (last.releaseMillis ?: 0)
        assertEquals(2700, total)
        assertTrue(total in 2000..3500)
    }

    // ---------------------------------------------------------------- Fehlstart-Folge: Grenzen

    @Test
    fun theSequenceOffsetWindowCountsForward() {
        // Der Startplan zaehlt rueckwaerts (-600000..0), die Fehlstart-Folge vorwaerts (0..60000)
        // - dieselbe Struktur, zwei Fenster, entschieden von der pruefenden Stelle.
        assertEquals(0, TimingToneLimits.SEQUENCE_OFFSET_MIN_MILLIS)
        assertEquals(60_000, TimingToneLimits.SEQUENCE_OFFSET_MAX_MILLIS)
        val ok = listOf(step(offsetMillis = 0), step(offsetMillis = 60_000))
        assertEquals(ValidationResult.Valid, TimingToneLimits.validateToneSequence(ok, "falseStartTone"))
        assertTrue(
            TimingToneLimits.validateToneSequence(listOf(step(offsetMillis = -1)), "falseStartTone")
                is ValidationResult.Invalid,
        )
        assertTrue(
            TimingToneLimits.validateToneSequence(listOf(step(offsetMillis = 60_001)), "falseStartTone")
                is ValidationResult.Invalid,
        )
        // Umgekehrt bleibt der Startplan bei seinem eigenen Fenster: 0 ja, +1 nein.
        assertTrue(
            TimingToneLimits.validateTonePlan(listOf(step(offsetMillis = 1)), "tonePlan")
                is ValidationResult.Invalid,
        )
    }

    @Test
    fun theSequenceSharesTheOtherToneLimits() {
        assertTrue(
            TimingToneLimits.validateToneSequence(listOf(step(offsetMillis = 0, frequencyHz = 99)), "falseStartTone")
                is ValidationResult.Invalid,
        )
        assertTrue(
            TimingToneLimits.validateToneSequence(listOf(step(offsetMillis = 0, durationMillis = 10_001)), "falseStartTone")
                is ValidationResult.Invalid,
        )
        assertTrue(
            TimingToneLimits.validateToneSequence(listOf(step(offsetMillis = 0, releaseMillis = 5001)), "falseStartTone")
                is ValidationResult.Invalid,
        )
        val many = (0..TimingToneLimits.MAX_PLAN_STEPS).map { step(offsetMillis = it * 100) }
        assertTrue(TimingToneLimits.validateToneSequence(many, "falseStartTone") is ValidationResult.Invalid)
        // null = eingebauter Standard, wie beim Plan.
        assertEquals(ValidationResult.Valid, TimingToneLimits.validateToneSequence(null, "falseStartTone"))
    }

    // ------------------------------------------------- Fehlstart-Folge: Einzelton-Bestand lesen

    @Test
    fun aStoredSingleToneObjectReadsAsAOneElementSequence() {
        // Bis zum 24.08.2026 stand in der Spalte ein OBJEKT. Ohne Migration entscheidet die
        // Gestalt des Werts: Objekt = ein Ton, sofort (Zeitpunkt 0). Genau dieser Stand steht
        // produktiv in der Spalte - ein 200-Hz-Saegezahn, 2000 ms, gehalten mit 0 ms Ausklingen.
        val stored = JSONB.jsonb(
            """{"frequencyHz":200,"durationMillis":2000,"releaseMillis":0,"waveform":"SAWTOOTH"}"""
        )
        assertEquals(
            listOf(
                ToneStep(
                    offsetMillis = 0,
                    frequencyHz = 200,
                    durationMillis = 2000,
                    releaseMillis = 0,
                    waveform = ToneWaveform.SAWTOOTH,
                )
            ),
            stored.toToneSequence(),
        )
    }

    @Test
    fun anEvenOlderSingleToneWithoutReleaseOrWaveformKeepsItsSound() {
        // Der aelteste Bestand: nur Hoehe und Dauer. Abfallend (releaseMillis null) und Sinus
        // (waveform null) muessen genau so herauskommen - beides sind Klangentscheidungen.
        val stored = JSONB.jsonb("""{"frequencyHz":440,"durationMillis":3000}""")
        val sequence = stored.toToneSequence()!!
        assertEquals(1, sequence.size)
        assertEquals(0, sequence.single().offsetMillis)
        assertNull(sequence.single().releaseMillis)
        assertNull(sequence.single().waveform)
    }

    @Test
    fun aStoredSequenceArrayIsReadAsIs() {
        val sequence = TimingToneLimits.DEFAULT_FALSE_START_SEQUENCE
        assertEquals(sequence, sequence.toJsonb().toToneSequence())
        // Und das Geschriebene ist ein Array - der Einzelton entsteht nicht mehr neu.
        assertTrue(sequence.toJsonb().data().trimStart().startsWith("["))
    }

    @Test
    fun anEmptyColumnStaysNullSoTheBuiltInDefaultWins() {
        assertNull((null as JSONB?).toToneSequence())
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
