import {TimingMatchDto, TimingSequenceDto} from '@api/types.gen.ts'

/**
 * Tonpläne der Zeitnahme: WELCHER Piep WANN relativ zum Start fällig ist.
 *
 * Alles hier ist pur (Muster `sequenceDisplay.ts`): die Komponenten halten nur einen
 * Fortschrittszeiger und rufen pro Tick [advanceTonePlan] — kein Timer-Gestrüpp, und die
 * Kernfrage „welcher Ton bei welcher Serverzeit" ist direkt testbar.
 */

// --- Wellenform ----------------------------------------------------------------------------------

/**
 * Die vier Grundformen des WebAudio-`OscillatorNode` als API-Werte. Englisch und großgeschrieben,
 * weil sie 1:1 den `OscillatorType`-Strings entsprechen (`'sine'` usw. — siehe [oscillatorType])
 * und die technischen Enums der Zeitnahme-API ohnehin englisch sind (`MASS`/`INTERVAL`,
 * `START`/`FINISH`/`SPLIT`); deutsch sind nur Fachbegriffe der Regattaleitung (`EINZEL`/`WELLE`).
 * `null`/nicht gesetzt = Sinus — kein bestehender Klang ändert sich.
 */
export const TONE_WAVEFORMS = ['SINE', 'TRIANGLE', 'SQUARE', 'SAWTOOTH'] as const
export type ToneWaveform = (typeof TONE_WAVEFORMS)[number]

/** `null`/nicht gesetzt ist gültig (= Sinus); gesetzt muss es eine der vier Grundformen sein. */
export function isValidToneWaveform(waveform: string | null | undefined): boolean {
    return waveform == null || (TONE_WAVEFORMS as readonly string[]).includes(waveform)
}

/** Der Web-Audio-`OscillatorNode.type` zur gewählten Form; nicht gesetzt = `'sine'`. */
export function oscillatorType(waveform?: ToneWaveform | null): OscillatorType {
    return (waveform ?? 'SINE').toLowerCase() as OscillatorType
}

/**
 * Fester Lautstärke-Formfaktor je Wellenform — der Spitzen-Gain, mit dem [oscillatorType] in
 * `feedback.ts` gespielt wird. Ohne Angleich wäre ein Wellenform-Wechsel im Editor zugleich ein
 * Lautstärkesprung: bei gleicher Amplitude tragen die Formen verschieden viel Energie (RMS: Sinus
 * ≈ 0.71, Dreieck/Sägezahn ≈ 0.58, Rechteck 1.0) UND verteilen sie verschieden aufs Spektrum.
 *
 * Die Werte sind eine dokumentierte Klangentscheidung, kein reiner RMS-Ausgleich:
 * - SINE 0.2: die bisherige Lautstärke aller Töne — bleibt exakt, damit Alt-Klänge nicht driften.
 * - TRIANGLE 0.22: RMS liegt UNTER dem Sinus und die Obertöne fallen steil ab (−12 dB/Okt.,
 *   klingt fast sinusartig) — leicht angehoben, aber nicht der volle RMS-Ausgleich (~0.245),
 *   damit das Dreieck nicht lauter wirkt als der Sinus.
 * - SQUARE 0.12: höchste RMS (doppelte Sinus-Energie bei gleicher Spitze) plus kräftige ungerade
 *   Obertöne im empfindlichsten Hörbereich (2–5 kHz) — deutlich unter den reinen RMS-Ausgleich
 *   (~0.14) gedrückt, weil das Ohr die Obertöne überproportional laut wahrnimmt.
 * - SAWTOOTH 0.14: RMS wie das Dreieck, aber das dichteste Spektrum (alle Obertöne,
 *   −6 dB/Okt.) — schriller als das Dreieck, deshalb zwischen Rechteck und Sinus einsortiert.
 */
export const TONE_WAVEFORM_GAIN: Record<ToneWaveform, number> = {
    SINE: 0.2,
    TRIANGLE: 0.22,
    SQUARE: 0.12,
    SAWTOOTH: 0.14,
}

/** Der wirksame Spitzen-Gain eines Tons; nicht gesetzt = Sinus = die bisherigen 0.2. */
export function toneGain(waveform?: ToneWaveform | null): number {
    return TONE_WAVEFORM_GAIN[waveform ?? 'SINE']
}

/**
 * Ein Eintrag des Tonplans. Strukturell identisch zum generierten API-Typ (`ToneStepDto`) —
 * bewusst eigenständig deklariert, damit die reine Logik nicht am Generat hängt.
 */
export type ToneStep = {
    /**
     * Der Zeitpunkt des Tons in ms. Die RICHTUNG hängt daran, WELCHE Folge ihn trägt (siehe
     * [ToneOffsetDirection]) — die Struktur ist für beide dieselbe:
     *
     * - Startplan (`BEFORE_START`): relativ zum Start, negativ = davor, 0 = der Start selbst;
     *   positive Werte gibt es dort nicht.
     * - Fehlstart-Folge (`AFTER_TRIGGER`): relativ zur Auslösung, 0 = sofort, positiv = so viele
     *   ms später; negative Werte gibt es dort nicht.
     */
    offsetMillis: number
    frequencyHz: number
    durationMillis: number
    /**
     * Wählt die HÜLLKURVE des Tons — zwei ausdrücklich verschiedene Klangformen:
     *
     * - `null`/nicht gesetzt = „Abfallend": die Lautstärke fällt über die GESAMTE Nenndauer
     *   exponentiell ab (die klassische Form — ein ausklingender Pling, siehe `feedback.ts`).
     * - Zahl 0–5000 = „Gehalten": die Nenndauer ([durationMillis]) ist die HALTEZEIT bei voller
     *   Lautstärke, das Ausklingen kommt OBENDRAUF (Gesamtklang = duration + release). Ein kurzes
     *   Ausklingen klingt abgehackt-steil, ein langes weich-flach; 0 endet nicht knallhart,
     *   sondern mit der eingebauten Mini-Entknackung ([TONE_HELD_MIN_RELEASE_MILLIS]) — innerhalb
     *   des Modus ist der Klang also stetig, 0 ≈ 1 ≈ 10 ms.
     *
     * 0 ist damit ein LEGITIMER Gehalten-Wert und wird nirgends mehr zu `null` normalisiert —
     * zwischen den beiden Formen liegt ein echter Modellwechsel, kein Zahlensprung.
     * `null` ist zugelassen, damit der generierte API-Typ (`ToneStepDto`) direkt hineinpasst.
     */
    releaseMillis?: number | null
    /**
     * Die Wellenform des Oszillators (siehe [TONE_WAVEFORMS]); `null`/nicht gesetzt = Sinus.
     * Unabhängig von der Hüllkurve: ein gehaltener Sägezahn trägt beides. Anders als bei
     * [releaseMillis] ist explizites `'SINE'` klanggleich mit „nicht gesetzt" — die Editoren
     * normalisieren es deshalb auf „nicht gesetzt" (siehe `tonePlanEditor.stepFromRow`).
     */
    waveform?: ToneWaveform | null
}

// --- Grenzen -------------------------------------------------------------------------------------
//
// Dieselben Grenzen prüft das Backend (TimingModeRequest/EventTimingConfigRequest) — hier stehen
// sie für die Formulare und die Vorschau. Frequenz 100–4000 Hz: darunter tragen kleine Lautsprecher
// nicht, darüber wird es unangenehm und viele Erwachsene hören es kaum noch. Dauer 20–10000 ms:
// kürzer ist kein hörbarer Piep mehr; die Obergrenze war früher 2000 ms (nicht in den Sekundentakt
// des Countdowns hineinragen), aber der lange Fehlstart-Ton braucht mehr — wer im Tonplan selbst
// einen 10-Sekünder konfiguriert, tut das jetzt bewusst. Ausklingen 0–5000 ms gilt NUR für die
// Gehalten-Hüllkurve (Abfallend hat kein Ausklingen-Feld); mehr als 5 s ist Hall-Spielerei.
// Offset −600000..0: negativ = vor dem Start, 0 = der Start selbst; die Untergrenze entspricht dem
// größten erlaubten Sequenz-Vorlauf (leadInMillis ≤ 600000). Positive Offsets sind bewusst NICHT
// erlaubt: nach dem Start wandert das Countdown-Ziel sofort zum nächsten Boot (INTERVAL), ein Ton
// „nach dem Start" wäre also je Boot mehrdeutig und kollidierte mit der Regel, verpasste Töne nie
// nachzuholen.
export const TONE_PLAN_MAX_STEPS = 30
export const TONE_FREQUENCY_MIN_HZ = 100
export const TONE_FREQUENCY_MAX_HZ = 4000
export const TONE_DURATION_MIN_MILLIS = 20
export const TONE_DURATION_MAX_MILLIS = 10_000
export const TONE_RELEASE_MIN_MILLIS = 0
export const TONE_RELEASE_MAX_MILLIS = 5000
export const TONE_OFFSET_MIN_MILLIS = -600_000
export const TONE_OFFSET_MAX_MILLIS = 0

/**
 * Das zweite Offset-Fenster: die Fehlstart-Folge zählt VORWÄRTS ab der Auslösung (0 = sofort).
 * Obergrenze eine Minute — ein Rückruf, der über eine Minute nach der Geste noch hupt, ist am
 * Wasser kein Rückruf mehr, sondern eine Störung; wer den Rahmen braucht, hat ihn. Dieselben
 * Grenzen prüft das Backend (TimingToneLimits.SEQUENCE_OFFSET_*).
 */
export const TONE_SEQUENCE_OFFSET_MIN_MILLIS = 0
export const TONE_SEQUENCE_OFFSET_MAX_MILLIS = 60_000

/**
 * Wohin die Zeitpunkte einer Folge zählen. Es gibt genau zwei Bezugspunkte im System, und sie
 * entscheiden über das erlaubte Offset-Fenster, die Beschriftung im Editor („−5 s" gegen
 * „+400 ms") und die Leserichtung der Zeitleiste:
 *
 * - `BEFORE_START`: der Startplan eines Zeitnahmetyps, rückwärts zum Start des Boots/der Welle.
 * - `AFTER_TRIGGER`: die Fehlstart-Folge, vorwärts ab der Auslösung (Versuchs-Rücknahme oder
 *   Sequenz-Abbruch).
 */
export type ToneOffsetDirection = 'BEFORE_START' | 'AFTER_TRIGGER'

/** Das erlaubte Offset-Fenster je Bezugspunkt — die eine Stelle, die beide Fälle kennt. */
export function toneOffsetLimits(direction: ToneOffsetDirection): {min: number; max: number} {
    return direction === 'AFTER_TRIGGER'
        ? {min: TONE_SEQUENCE_OFFSET_MIN_MILLIS, max: TONE_SEQUENCE_OFFSET_MAX_MILLIS}
        : {min: TONE_OFFSET_MIN_MILLIS, max: TONE_OFFSET_MAX_MILLIS}
}

/**
 * Mini-Entknackung der Gehalten-Hüllkurve: ein bei voller Lautstärke gestoppter Oszillator
 * knackt hörbar (die Wellenform reißt mitten im Schwung ab). Deshalb fällt auch „Ausklingen 0"
 * über diese wenigen Millisekunden ab — unhörbar als Ausklingen, aber knackfrei. Zugleich die
 * Untergrenze des wirksamen Ausklingens: 0–8 ms klingen identisch, der Modus ist stetig.
 */
export const TONE_HELD_MIN_RELEASE_MILLIS = 8

/**
 * Ob eine Ausklingzeit gültig ist. `null`/`undefined` heißt „Abfallend — kein Ausklingen-Feld"
 * und ist immer gültig; ein gesetzter Wert (Gehalten) muss eine ganze Zahl in 0–5000 ms sein,
 * 0 eingeschlossen (siehe [ToneStep.releaseMillis]).
 */
export function isValidToneRelease(releaseMillis: number | null | undefined): boolean {
    return (
        releaseMillis == null ||
        (Number.isInteger(releaseMillis) &&
            releaseMillis >= TONE_RELEASE_MIN_MILLIS &&
            releaseMillis <= TONE_RELEASE_MAX_MILLIS)
    )
}

/**
 * Ob ein einzelner Eintrag innerhalb aller Grenzen liegt (Formular-Validierung). Der Bezugspunkt
 * entscheidet nur über das Offset-Fenster; ohne Angabe gilt der Startplan (rückwärts), weil das
 * der ältere und häufigere Fall ist.
 */
export function isValidToneStep(
    step: ToneStep,
    direction: ToneOffsetDirection = 'BEFORE_START',
): boolean {
    const offset = toneOffsetLimits(direction)
    return (
        Number.isInteger(step.offsetMillis) &&
        step.offsetMillis >= offset.min &&
        step.offsetMillis <= offset.max &&
        Number.isInteger(step.frequencyHz) &&
        step.frequencyHz >= TONE_FREQUENCY_MIN_HZ &&
        step.frequencyHz <= TONE_FREQUENCY_MAX_HZ &&
        Number.isInteger(step.durationMillis) &&
        step.durationMillis >= TONE_DURATION_MIN_MILLIS &&
        step.durationMillis <= TONE_DURATION_MAX_MILLIS &&
        isValidToneRelease(step.releaseMillis) &&
        isValidToneWaveform(step.waveform)
    )
}

// --- Standardpläne -------------------------------------------------------------------------------

/**
 * Der eingebaute Standard-Startplan = exakt das bisherige Verhalten des Countdowns
 * (T−5…T−1 kurzer 600-Hz-Tick à 100 ms, T−0 langer 900-Hz-Ton à 400 ms). Ein Zeitnahmetyp ohne
 * eigenen Plan (`tonePlan` null) klingt damit keinen Deut anders als vor dem Editor.
 */
export const DEFAULT_START_TONE_PLAN: readonly ToneStep[] = [
    {offsetMillis: -5000, frequencyHz: 600, durationMillis: 100},
    {offsetMillis: -4000, frequencyHz: 600, durationMillis: 100},
    {offsetMillis: -3000, frequencyHz: 600, durationMillis: 100},
    {offsetMillis: -2000, frequencyHz: 600, durationMillis: 100},
    {offsetMillis: -1000, frequencyHz: 600, durationMillis: 100},
    {offsetMillis: 0, frequencyHz: 900, durationMillis: 400},
]

/** Voreinstellung „Nur Start": ein einziger Ton beim Start, wie der heutige T−0-Ton. */
export const PRESET_ONLY_START: readonly ToneStep[] = [
    {offsetMillis: 0, frequencyHz: 900, durationMillis: 400},
]

/**
 * Voreinstellung „10−5−4−3−2−1−Start": zusätzlich ein Piep bei D−10; der letzte Ton beim Start
 * bleibt länger und höher, wie es heute klingt.
 */
export const PRESET_TEN_COUNTDOWN: readonly ToneStep[] = [
    {offsetMillis: -10_000, frequencyHz: 600, durationMillis: 100},
    ...DEFAULT_START_TONE_PLAN,
]

/**
 * Der eingebaute Erfassungston (Ziel-/Zwischenposten) = exakt der bisherige Bestätigungs-Piep
 * beim Erfassen (880 Hz, 150 ms — siehe `playCaptureFeedback`).
 */
export const DEFAULT_CAPTURE_TONE = {frequencyHz: 880, durationMillis: 150}

/**
 * Die eingebaute Fehlstart-FOLGE: kurz — kurz — lang, alles Sägezahn, alles gehalten.
 *
 * Warum eine Folge und kein Einzelton: ein einzelner langer Ton kann am Wasser als „irgendein
 * Signal" durchgehen; eine WIEDERHOLUNG mit abweichendem Schluss ist auch über Wind und
 * Motorenlärm als Muster erkennbar — „död, död, dööööd" liest sich als Rückruf, nicht als Piep.
 * Der abweichende letzte Ton ist zugleich der Grund, warum das hier eine Liste ist und kein
 * Wiederholungs-Zähler: ein Zähler könnte „zweimal kurz, einmal lang und tiefer" nicht sagen.
 *
 * Die Werte im Einzelnen:
 * - SAWTOOTH bleibt aus dem früheren Einzelton-Standard erhalten — die EINE gewollte Ausnahme von
 *   „Standard bleibt Sinus": ein Sinus geht im Regattalärm als „irgendein Piep" unter, der
 *   Sägezahn schneidet durch.
 * - 200 Hz statt der früheren 440 Hz: tiefer trägt weiter über Wasser und hebt sich deutlicher
 *   von Countdown-Ticks (600 Hz) und Startton (900 Hz) ab. Viel tiefer geht nicht — unter 200 Hz
 *   geben kleine Tablet-Lautsprecher kaum noch Grundton her.
 * - Der Schlusston liegt mit 180 Hz eine Kleinigkeit TIEFER als die beiden kurzen: eine fallende
 *   Tonhöhe hört sich als Abschluss, eine steigende als Frage — der Rückruf soll nicht klingen,
 *   als käme noch etwas.
 * - Raster 400 ms bei 300 ms Dauer, also 100 ms Stille dazwischen: knapp genug, dass die drei als
 *   EIN Signal zusammengehören, weit genug, dass sie als drei Schläge hörbar bleiben.
 * - Gehalten statt abfallend: ein abfallender Ton verliert schon in der ersten Hälfte an Kraft
 *   und klingt zaghaft. Die kurzen enden mit Ausklingen 0, also staccato (die eingebaute
 *   Mini-Entknackung verhindert das Knacken); der lange fällt über 400 ms weich ab.
 * - Gesamtlänge 800 + 1500 + 400 = 2700 ms — fast genau die 3000 ms des alten Einzeltons: das
 *   Signal beansprucht den Startbereich nicht länger als bisher, und das Entprell-Fenster gegen
 *   Doppelauslöser bleibt in derselben Größenordnung.
 *
 * Dieselbe Folge hält das Backend in `TimingToneLimits.DEFAULT_FALSE_START_SEQUENCE` und liefert
 * sie über GET /timing/settings aufgelöst aus.
 */
export const DEFAULT_FALSE_START_SEQUENCE: readonly ToneStep[] = [
    {offsetMillis: 0, frequencyHz: 200, durationMillis: 300, releaseMillis: 0, waveform: 'SAWTOOTH'},
    {offsetMillis: 400, frequencyHz: 200, durationMillis: 300, releaseMillis: 0, waveform: 'SAWTOOTH'},
    {offsetMillis: 800, frequencyHz: 180, durationMillis: 1500, releaseMillis: 400, waveform: 'SAWTOOTH'},
]

/**
 * Vorlage „Einzelton": der Fehlstart als EIN langes Horn — das Verhalten vor der Tonfolge, für
 * alle, die es so gewohnt sind. Bewusst mit den Werten des alten eingebauten Standards
 * (440 Hz / 3000 ms, abfallend), damit „zurück auf früher" ohne Nachrechnen möglich bleibt.
 */
export const PRESET_FALSE_START_SINGLE: readonly ToneStep[] = [
    {offsetMillis: 0, frequencyHz: 440, durationMillis: 3000, waveform: 'SAWTOOTH'},
]

/**
 * Vorlage „Dreifach kurz": drei gleiche kurze Schläge im 400-ms-Raster — das nüchterne Muster
 * ohne den abweichenden Schluss, für Reviere, in denen der lange Ton mit anderen Signalen
 * kollidiert.
 */
export const PRESET_FALSE_START_TRIPLE: readonly ToneStep[] = [
    {offsetMillis: 0, frequencyHz: 200, durationMillis: 300, releaseMillis: 0, waveform: 'SAWTOOTH'},
    {offsetMillis: 400, frequencyHz: 200, durationMillis: 300, releaseMillis: 0, waveform: 'SAWTOOTH'},
    {offsetMillis: 800, frequencyHz: 200, durationMillis: 300, releaseMillis: 0, waveform: 'SAWTOOTH'},
]

/**
 * Vorbelegte Dauer NEU angelegter Töne in den Editoren („Ton hinzufügen", frisch geleerte
 * Felder). Bewusst NICHT die Dauer irgendeines eingebauten Standards — die Standardpläne und
 * -töne behalten ihre destillierten Werte (100/400/150/3000 ms), nur der Startpunkt fürs
 * eigene Basteln ist 500 ms.
 */
export const NEW_TONE_DURATION_MILLIS = 500

/**
 * Die gewählte Hüllkurve eines Tons als benanntes Modell — die Editoren zeigen sie an
 * („abfallend" / „gehalten · X ms Ausklingen") und die Wiedergabe schaltet danach.
 */
export type ToneEnvelope = {kind: 'DECAY'} | {kind: 'HELD'; releaseMillis: number}

/** `null`/nicht gesetzt = Abfallend; jede Zahl (auch 0) = Gehalten mit genau diesem Ausklingen. */
export function toneEnvelope(tone: {releaseMillis?: number | null}): ToneEnvelope {
    return tone.releaseMillis == null
        ? {kind: 'DECAY'}
        : {kind: 'HELD', releaseMillis: tone.releaseMillis}
}

/**
 * Das WIRKSAME Ausklingen in ms: Abfallend hat keins (`null`, der Abfall liegt in der Nenndauer);
 * Gehalten fällt nie schneller als die Mini-Entknackung ab (siehe [TONE_HELD_MIN_RELEASE_MILLIS]).
 */
export function effectiveReleaseMillis(releaseMillis: number | null | undefined): number | null {
    return releaseMillis == null ? null : Math.max(releaseMillis, TONE_HELD_MIN_RELEASE_MILLIS)
}

/**
 * Gesamtklanglänge eines Tons: Nenndauer (Haltezeit) plus wirksames Ausklingen. Abfallend klingt
 * genau seine Nenndauer (der Abfall liegt IN der Nenndauer); Gehalten hängt mindestens die
 * Mini-Entknackung hinten an (siehe [ToneStep.releaseMillis]).
 */
export function toneTotalMillis(tone: {durationMillis: number; releaseMillis?: number | null}): number {
    return tone.durationMillis + (effectiveReleaseMillis(tone.releaseMillis) ?? 0)
}

// --- Normalisierung und Vergleich ----------------------------------------------------------------

/** Aufsteigend nach Offset sortiert, ohne die Eingabe zu verändern — die Ableitung setzt das voraus. */
export function sortedTonePlan(plan: readonly ToneStep[]): ToneStep[] {
    return [...plan].sort((a, b) => a.offsetMillis - b.offsetMillis)
}

/**
 * Klanggenauer Vergleich ZWEIER Folgen, jeweils nach Zeitpunkt sortiert. Bei der Hüllkurve zählt
 * exakt mit: „Gehalten mit 0 ms" (`releaseMillis` 0) ist eine andere Klangform als das abfallende
 * `null` — nur `undefined`/`null` sind gleich. Bei der Wellenform ist explizites SINE dagegen
 * KLANGGLEICH mit „nicht gesetzt" (gleicher Oszillatortyp, gleicher Formfaktor — siehe
 * [oscillatorType] und [toneGain]), deshalb darf dort auf Sinus vereinheitlicht werden.
 */
export function equalsToneSequence(a: readonly ToneStep[], b: readonly ToneStep[]): boolean {
    const left = sortedTonePlan(a)
    const right = sortedTonePlan(b)
    return (
        left.length === right.length &&
        left.every((step, index) => {
            const reference = right[index]
            return (
                step.offsetMillis === reference.offsetMillis &&
                step.frequencyHz === reference.frequencyHz &&
                step.durationMillis === reference.durationMillis &&
                (step.releaseMillis ?? null) === (reference.releaseMillis ?? null) &&
                (step.waveform ?? 'SINE') === (reference.waveform ?? 'SINE')
            )
        })
    )
}

/**
 * Ob ein Plan inhaltlich dem eingebauten Standard entspricht. Der Editor schickt dann `null`
 * statt des Plans: so bleibt „unkonfiguriert" in der Datenbank unkonfiguriert, und eine künftige
 * Änderung des Standards erreicht auch Typen, deren Plan nie bewusst verstellt wurde.
 */
export function equalsDefaultStartPlan(plan: readonly ToneStep[]): boolean {
    return equalsToneSequence(plan, DEFAULT_START_TONE_PLAN)
}

/** Dasselbe für die Fehlstart-Folge — „Standard wiederherstellen" vergleicht hiergegen. */
export function equalsDefaultFalseStartSequence(sequence: readonly ToneStep[]): boolean {
    return equalsToneSequence(sequence, DEFAULT_FALSE_START_SEQUENCE)
}

/**
 * Wie lange eine ganze Folge klingt, gerechnet ab ihrem ERSTEN Ton: der späteste Zeitpunkt, an
 * dem noch etwas zu hören ist. Nicht einfach „letzter Zeitpunkt + Dauer": bei überlappenden Tönen
 * kann ein FRÜHERER, sehr langer Ton den letzten überdauern, und das Sperrfenster gegen
 * Doppelauslöser soll den ganzen Klang abdecken, nicht nur seinen Schluss.
 *
 * Eine leere Folge dauert 0 ms — das darf nicht knallen, auch wenn sie im Betrieb nie vorkommt
 * (der Server löst unkonfiguriert auf den Standard auf).
 */
export function toneSequenceTotalMillis(sequence: readonly ToneStep[]): number {
    if (sequence.length === 0) return 0
    const first = Math.min(...sequence.map(step => step.offsetMillis))
    return Math.max(
        ...sequence.map(step => step.offsetMillis - first + toneTotalMillis(step)),
    )
}

/**
 * Der Abspielplan einer Folge in ECHTZEIT: die Zeitpunkte werden nur auf den ersten Ton
 * nullgesetzt, sonst nichts gerafft. Für die Fehlstart-Folge ist das der Betriebsfall (der erste
 * Ton liegt ohnehin bei 0), und im Editor ist es die ehrliche Vorschau — anders als beim
 * Startplan, wo ein Ton bei −60 s die Vorschau unbrauchbar machen würde ([previewSchedule]).
 */
export function sequenceSchedule(sequence: readonly ToneStep[]): PreviewTone[] {
    const sorted = sortedTonePlan(sequence)
    if (sorted.length === 0) return []
    const first = sorted[0].offsetMillis
    return sorted.map(step => ({atMillis: step.offsetMillis - first, step}))
}

// --- Ableitung „welcher Ton wann" ----------------------------------------------------------------

/**
 * Wie lange nach seinem Zeitpunkt ein Ton noch gespielt wird. Entspricht der bisherigen
 * Sekunden-Granularität des Countdowns: ein Tick, der bis zu knapp eine Sekunde nach dem
 * Soll-Moment kommt (rAF-Drossel, kurzes Ruckeln), spielt den Ton noch — alles Ältere ist
 * verpasst und bleibt still (nie Piep-Salven nach verdecktem Tab).
 */
export const TONE_FRESHNESS_MILLIS = 1000

export type ToneAdvance = {
    /** Neuer Fortschrittszeiger: Index des letzten fälligen Eintrags (auch wenn er verfiel). */
    playedUpTo: number
    /** Der jetzt zu spielende Ton, oder null (nichts fällig / alles Fällige zu alt). */
    play: ToneStep | null
}

/**
 * Ein Tick der Tonplan-Wiedergabe: Gegeben der (sortierte) Plan, das Countdown-Ziel
 * (`targetMillis`, Serverzeit des nächsten Starts), die aktuelle Serverzeit und der bisherige
 * Fortschrittszeiger (`playedUpTo`, initial −1; bei Zielwechsel zurücksetzen), liefert der Aufruf
 * höchstens EINEN Ton:
 *
 * - Fällig ist der letzte Eintrag, dessen Zeitpunkt (`targetMillis + offsetMillis`) erreicht ist.
 * - Übersprungene frühere Einträge werden NIE nachgeholt — der Zeiger springt über sie hinweg
 *   (Tab war verdeckt, Board kam zu spät dazu: Stille statt Piep-Salve).
 * - Auch der fällige Eintrag selbst verfällt, wenn er älter als [TONE_FRESHNESS_MILLIS] ist —
 *   dieselbe Toleranz, mit der der bisherige Countdown innerhalb „seiner" Sekunde noch piepste.
 */
export function advanceTonePlan(
    plan: readonly ToneStep[],
    targetMillis: number,
    nowMillis: number,
    playedUpTo: number,
): ToneAdvance {
    let lastDue = -1
    for (let index = 0; index < plan.length; index++) {
        if (targetMillis + plan[index].offsetMillis <= nowMillis) {
            lastDue = index
        } else {
            break
        }
    }
    if (lastDue <= playedUpTo) return {playedUpTo, play: null}

    const dueAt = targetMillis + plan[lastDue].offsetMillis
    const fresh = nowMillis - dueAt <= TONE_FRESHNESS_MILLIS
    return {playedUpTo: lastDue, play: fresh ? plan[lastDue] : null}
}

// --- Plan-Auflösung je Sequenz -------------------------------------------------------------------

/**
 * Die Partie, die eine laufende Sequenz startet — über ihre Boote gefunden, denn jedes Boot steht
 * in genau einer Partie. Das ist der Griff, mit dem ein Board von „was läuft gerade" auf „welcher
 * Zeitnahmetyp, und damit welche Töne" kommt; ohne Sequenz oder ohne Treffer in der Startliste
 * gibt es keine geführte Partie.
 */
export function matchOfSequence(
    matches: readonly TimingMatchDto[],
    sequence: TimingSequenceDto | undefined,
): TimingMatchDto | undefined {
    if (sequence === undefined) return undefined
    const teamIds = new Set(sequence.entries.map(entry => entry.competitionMatchTeam))
    return matches.find(candidate =>
        candidate.teams.some(team => teamIds.has(team.competitionMatchTeam)),
    )
}

/**
 * Der wirksame Tonplan einer laufenden Sequenz: Über [matchOfSequence] wird die Partie gefunden,
 * und deren aufgelöster Zeitnahmetyp (Runde schlägt Wettkampf — bereits serverseitig aufgelöst)
 * trägt den Plan seines Ton-Satzes. Ohne Treffer oder ohne konfigurierten Plan gilt der eingebaute
 * Standard — so klingt ein unkonfigurierter Typ exakt wie bisher.
 */
export function tonePlanForSequence(
    matches: readonly TimingMatchDto[],
    sequence: TimingSequenceDto | undefined,
): ToneStep[] {
    const plan = matchOfSequence(matches, sequence)?.timingMode?.resolvedToneSet.sequenceTonePlan
    if (plan != null && plan.length > 0) return sortedTonePlan(plan)
    return [...DEFAULT_START_TONE_PLAN]
}

// --- Vorschau ------------------------------------------------------------------------------------

/** Ein Abspielzeitpunkt der Editor-Vorschau, relativ zum Vorschau-Beginn. */
export type PreviewTone = {atMillis: number; step: ToneStep}

/**
 * Größte Pause der Vorschau. Die Vorschau spielt den Plan zeitlich GERAFFT: Pausen über 2 s
 * werden auf 2 s gekürzt. So bleibt der Rhythmus der letzten Sekunden echt (dort liegen die Töne
 * ohnehin enger), aber ein Plan mit „Piep bei Sequenzstart, −60 s" zwingt niemanden, eine Minute
 * auf den nächsten Ton zu warten — das wäre als Vorschau unverständlicher, nicht ehrlicher.
 */
export const PREVIEW_MAX_GAP_MILLIS = 2000

/** Abspielplan der „Sequenz anhören"-Vorschau: erster Ton sofort, danach geraffte Abstände. */
export function previewSchedule(plan: readonly ToneStep[]): PreviewTone[] {
    const sorted = sortedTonePlan(plan)
    const result: PreviewTone[] = []
    let at = 0
    for (let index = 0; index < sorted.length; index++) {
        if (index > 0) {
            const gap = sorted[index].offsetMillis - sorted[index - 1].offsetMillis
            at += Math.min(gap, PREVIEW_MAX_GAP_MILLIS)
        }
        result.push({atMillis: at, step: sorted[index]})
    }
    return result
}
