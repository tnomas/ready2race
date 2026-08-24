package de.lambda9.ready2race.backend.app.timing.entity

import de.lambda9.ready2race.backend.validation.ValidationResult

/**
 * Die Wellenform eines Zeitnahme-Tons: die vier Grundformen des WebAudio-`OscillatorNode`, mit
 * denen die Boards synthetisieren. Die Werte sind englisch und großgeschrieben, weil sie 1:1 den
 * `OscillatorType`-Strings des Browsers entsprechen (`'sine'`, `'triangle'`, `'square'`,
 * `'sawtooth'`) und die technischen Enums der Zeitnahme-API ohnehin englisch sind
 * ([SequenceMode.MASS]/[SequenceMode.INTERVAL], [TimingStationType]); deutsch sind nur
 * Fachbegriffe der Regattaleitung ([TimingStartGrouping.EINZEL]/[TimingStartGrouping.WELLE]).
 *
 * `null`/nicht gesetzt = [SINE] - kein bestehender, ohne dieses Feld gespeicherter Klang ändert
 * sich. Eine eigene Validierung braucht das Feld nicht: der Enum-Typ selbst lässt nur die vier
 * Werte zu, fremde Strings scheitern bereits beim Einlesen (Jackson - Request wie jsonb-Spalte).
 */
enum class ToneWaveform {
    SINE,
    TRIANGLE,
    SQUARE,
    SAWTOOTH,
}

/**
 * EIN Ton einer Tonfolge: WELCHER Piep WANN, relativ zu einem Bezugspunkt. Ein und dieselbe
 * Struktur trägt beide Tonfolgen des Systems - der Unterschied liegt allein in der RICHTUNG des
 * [offsetMillis], und die entscheidet das FELD, das die Folge trägt, nicht der Typ:
 *
 * - **Startplan** (`timing_mode.tone_plan`): der Bezugspunkt ist der Start des jeweiligen
 *   Boots/der Welle, gezählt wird RÜCKWÄRTS - [offsetMillis] negativ = vor dem Start, 0 = der
 *   Start selbst; positive Werte sind hier nicht erlaubt (nach dem Start wandert das
 *   Countdown-Ziel sofort zum nächsten Boot, ein Ton "nach dem Start" wäre je Boot mehrdeutig).
 *   Geprüft von [TimingToneLimits.validateTonePlan] (-600000..0).
 * - **Fehlstart-Folge** (`event.timing_false_start_tone`): der Bezugspunkt ist die AUSLÖSUNG
 *   (Versuchs-Rücknahme oder Sequenz-Abbruch), gezählt wird VORWÄRTS - [offsetMillis] 0 = sofort,
 *   positive Werte = so viele ms später. Geprüft von [TimingToneLimits.validateToneSequence]
 *   (0..+60000).
 *
 * Warum EIN Typ und nicht zwei: die fünf Felder, ihre Grenzen, der jsonb-Mapper, der
 * Editor-Baustein und die Wiedergabe im Board sind für beide Folgen dasselbe - ein zweiter Typ
 * wäre eine reine Kopie, die bei jeder Feld-Erweiterung (zuletzt `releaseMillis`, dann
 * `waveform`) doppelt gepflegt werden müsste. Verschieden ist nur die eine Zahl-Grenze, und die
 * gehört ohnehin an die Stelle, die die Folge validiert. Am Draht heißt der Typ `ToneStepDto` und
 * wird von beiden Feldern referenziert.
 */
data class ToneStep(
    val offsetMillis: Int,
    val frequencyHz: Int,
    val durationMillis: Int,
    /**
     * Wählt die HÜLLKURVE des Tons - zwei ausdrücklich verschiedene Klangformen, kein stufenloser
     * Regler: null = "Abfallend" (exponentieller Abfall über die GESAMTE Nenndauer, die klassische
     * Form); 0-5000 = "Gehalten" ([durationMillis] ist die HALTEZEIT bei voller Lautstärke, der
     * Abfall kommt obendrauf - Gesamtklang = duration + release, und darf die Nenndauer überragen).
     * 0 ist ein LEGITIMER Gehalten-Wert (die Boards spielen dann eine eingebaute Mini-Entknackung
     * von wenigen ms, damit nichts knackt) und wird nirgends zu null normalisiert - null und 0
     * sind VERSCHIEDENE Klangformen.
     */
    val releaseMillis: Int? = null,
    /**
     * Wellenform des Oszillators, unabhängig von der Hüllkurve (ein gehaltener Sägezahn trägt
     * beides); null = Sinus. Anders als bei [releaseMillis] ist explizit [ToneWaveform.SINE]
     * klanggleich mit null - die Editoren normalisieren es deshalb auf "nicht gesetzt".
     */
    val waveform: ToneWaveform? = null,
)

/**
 * Ein einzelner konfigurierbarer Ton der Veranstaltung (Höhe/Dauer/Ausklingen): der
 * Bestätigungston beim Erfassen am FINISH- bzw. SPLIT-Posten, jeweils als eigene jsonb-Spalte am
 * Event. null in der Datenbank = eingebauter Standard ([TimingToneLimits.DEFAULT_CAPTURE_TONE]).
 *
 * Ein Erfassungston bleibt bewusst ein EINZELTON: er bestätigt einen Tastendruck und muss knapp
 * sein - eine Folge würde die nächste Erfassung überlappen. Die zweite Rolle dieses Typs ist
 * Alt-Bestand: der Fehlstart-Ton war bis zum 24.08.2026 ebenfalls ein Einzelton und liegt in
 * bestehenden Datenbanken noch als jsonb-OBJEKT dieser Gestalt - `JSONB?.toToneSequence()` liest
 * genau das und macht daraus eine einelementige Folge (siehe Conversions.kt).
 */
data class CaptureTone(
    val frequencyHz: Int,
    val durationMillis: Int,
    /** Hüllkurven-Wahl wie bei [ToneStep.releaseMillis]; null = Abfallend, 0-5000 = Gehalten. */
    val releaseMillis: Int? = null,
    /** Wellenform wie bei [ToneStep.waveform]; null = Sinus. */
    val waveform: ToneWaveform? = null,
)

/**
 * Grenzen und Vorgaben der Zeitnahme-Töne - EINE Stelle für Request-Validierung und
 * Einstellungs-Auflösung; das Frontend prüft dieselben Werte in seinen Formularen.
 *
 * Frequenz 100..4000 Hz: darunter tragen kleine Lautsprecher nicht, darüber wird es unangenehm.
 * Dauer 20..10000 ms: kürzer ist kein hörbarer Piep mehr; die Obergrenze war früher 2000 ms
 * (nicht in den Sekundentakt hineinragen), aber der lange Fehlstart-Ton braucht mehr - wer im
 * Tonplan selbst einen 10-Sekünder konfiguriert, tut das jetzt bewusst.
 * Ausklingen 0..5000 ms gilt nur für die Gehalten-Hüllkurve; null = Abfallend (Abfall über die
 * Nenndauer) - null und 0 sind verschiedene Klangformen, siehe [ToneStep.releaseMillis].
 *
 * ZWEI Offset-Fenster, je nach Bezugspunkt der Folge (siehe [ToneStep]):
 * - Startplan -600000..0 ms: rückwärts zum Start; die Untergrenze entspricht dem größten
 *   erlaubten Sequenz-Vorlauf (leadInMillis <= 600000, siehe CreateSequenceRequest).
 * - Fehlstart-Folge 0..+60000 ms: vorwärts ab der Auslösung. Die Obergrenze ist eine Minute -
 *   ein Rückruf, der über eine Minute nach der Geste noch hupt, ist am Wasser kein Rückruf mehr,
 *   sondern eine Störung; wer den Rahmen braucht, hat ihn.
 * Höchstens 30 Einträge je Folge (beide).
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
    const val SEQUENCE_OFFSET_MIN_MILLIS = 0
    const val SEQUENCE_OFFSET_MAX_MILLIS = 60_000

    /** Der bisherige Erfassungs-Piep (880 Hz / 150 ms) - unkonfiguriert klingt nichts anders. */
    val DEFAULT_CAPTURE_TONE = CaptureTone(frequencyHz = 880, durationMillis = 150)

    /**
     * Die eingebaute Fehlstart-FOLGE: kurz - kurz - lang, alles Sägezahn, alles gehalten.
     *
     * Warum eine Folge und kein Einzelton: ein einzelner langer Ton kann am Wasser als "irgendein
     * Signal" durchgehen; eine WIEDERHOLUNG mit abweichendem Schluss ist auch über Wind und
     * Motorenlärm als Muster erkennbar - "död, död, dööööd" liest sich als Rückruf, nicht als
     * Piep. Der abweichende letzte Ton ist der Grund, warum die Folge eine Liste ist und kein
     * Wiederholungs-Zähler: ein Zähler könnte "zweimal kurz, einmal lang und tiefer" nicht
     * ausdrücken.
     *
     * Die Werte im Einzelnen:
     * - SAWTOOTH bleibt aus dem alten Einzelton-Standard erhalten - die EINE gewollte Ausnahme
     *   von "Standard bleibt Sinus": ein Sinus geht im Regattalärm als "irgendein Piep" unter,
     *   der Sägezahn schneidet durch.
     * - 200 Hz statt der früheren 440 Hz: tiefer trägt weiter über Wasser und hebt sich deutlicher
     *   von den Countdown-Ticks (600 Hz) und dem Startton (900 Hz) ab. Unter 200 Hz geben kleine
     *   Tablet-Lautsprecher kaum noch Grundton her, deshalb ist hier die praktische Untergrenze.
     * - Der Schlusston liegt mit 180 Hz eine Kleinigkeit TIEFER als die beiden kurzen: eine
     *   fallende Tonhöhe hört sich als Abschluss, eine steigende als Frage - der Rückruf soll
     *   nicht klingen, als käme noch etwas.
     * - Raster 400 ms bei 300 ms Dauer: 100 ms Stille zwischen den Tönen. Das ist knapp genug,
     *   dass die drei als EIN Signal zusammengehören, und weit genug, dass sie als drei getrennte
     *   Schläge hörbar bleiben.
     * - Gehalten (nicht abfallend) für alle drei: ein abfallender Ton verliert schon in der
     *   ersten Hälfte an Kraft und klingt zaghaft. Die beiden kurzen enden mit Ausklingen 0, also
     *   staccato (die eingebaute Mini-Entknackung der Boards verhindert das Knacken); der lange
     *   fällt über 400 ms weich ab, damit das Signal nicht abgeschnitten wirkt.
     * - Gesamtlänge 800 + 1500 + 400 = 2700 ms - fast genau die 3000 ms des alten Einzeltons.
     *   Das Signal beansprucht den Startbereich also nicht länger als bisher, und das
     *   Entprell-Fenster gegen Doppelauslöser bleibt in derselben Größenordnung.
     *
     * Da GET /timing/settings die Töne AUFGELÖST ausliefert (unkonfiguriert = diese Folge),
     * erreicht die Entscheidung alle Boards; das Formular ("Standard wiederherstellen")
     * vergleicht gegen dieselbe Folge im Frontend (DEFAULT_FALSE_START_SEQUENCE, tonePlan.ts).
     */
    val DEFAULT_FALSE_START_SEQUENCE: List<ToneStep> = listOf(
        ToneStep(offsetMillis = 0, frequencyHz = 200, durationMillis = 300, releaseMillis = 0, waveform = ToneWaveform.SAWTOOTH),
        ToneStep(offsetMillis = 400, frequencyHz = 200, durationMillis = 300, releaseMillis = 0, waveform = ToneWaveform.SAWTOOTH),
        ToneStep(offsetMillis = 800, frequencyHz = 180, durationMillis = 1500, releaseMillis = 400, waveform = ToneWaveform.SAWTOOTH),
    )

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

    /** null ist gültig (Abfallend); ein gesetzter Wert (Gehalten, 0 eingeschlossen) muss in 0..5000 ms liegen. */
    private fun validateRelease(value: Int?, field: String): ValidationResult =
        if (value != null && (value < RELEASE_MIN_MILLIS || value > RELEASE_MAX_MILLIS)) {
            ValidationResult.Invalid.Message { "$field.releaseMillis must be between $RELEASE_MIN_MILLIS and $RELEASE_MAX_MILLIS" }
        } else {
            ValidationResult.Valid
        }

    /**
     * Der gemeinsame Kern beider Folgen-Prüfungen: Anzahl, Frequenz, Dauer, Ausklingen sind
     * identisch; einzig das erlaubte Offset-Fenster kommt von außen (siehe [ToneStep]).
     * null ist gültig und bedeutet "eingebauter Standard".
     */
    private fun validateSteps(
        steps: List<ToneStep>?,
        field: String,
        offsetMin: Int,
        offsetMax: Int,
    ): ValidationResult {
        if (steps == null) return ValidationResult.Valid
        if (steps.size > MAX_PLAN_STEPS) {
            return ValidationResult.Invalid.Message { "$field must not contain more than $MAX_PLAN_STEPS steps" }
        }
        return ValidationResult.allOf(
            *steps.mapIndexed { index, step ->
                val stepField = "$field[$index]"
                ValidationResult.allOf(
                    if (step.offsetMillis < offsetMin || step.offsetMillis > offsetMax) {
                        ValidationResult.Invalid.Message { "$stepField.offsetMillis must be between $offsetMin and $offsetMax" }
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

    /** Startplan: Offsets RÜCKWÄRTS zum Start (-600000..0). null = eingebauter Standardplan. */
    fun validateTonePlan(plan: List<ToneStep>?, field: String): ValidationResult =
        validateSteps(plan, field, OFFSET_MIN_MILLIS, OFFSET_MAX_MILLIS)

    /**
     * Fehlstart-Folge: Offsets VORWÄRTS ab der Auslösung (0..+60000). null = eingebaute
     * Standardfolge ([DEFAULT_FALSE_START_SEQUENCE]).
     */
    fun validateToneSequence(sequence: List<ToneStep>?, field: String): ValidationResult =
        validateSteps(sequence, field, SEQUENCE_OFFSET_MIN_MILLIS, SEQUENCE_OFFSET_MAX_MILLIS)

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
