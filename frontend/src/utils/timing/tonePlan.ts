import {TimingMatchDto, TimingSequenceDto} from '@api/types.gen.ts'

/**
 * Tonpläne der Zeitnahme: WELCHER Sinus-Piep WANN relativ zum Start fällig ist.
 *
 * Alles hier ist pur (Muster `sequenceDisplay.ts`): die Komponenten halten nur einen
 * Fortschrittszeiger und rufen pro Tick [advanceTonePlan] — kein Timer-Gestrüpp, und die
 * Kernfrage „welcher Ton bei welcher Serverzeit" ist direkt testbar.
 */

/**
 * Ein Eintrag des Tonplans. Strukturell identisch zum generierten API-Typ (`ToneStepDto`) —
 * bewusst eigenständig deklariert, damit die reine Logik nicht am Generat hängt.
 */
export type ToneStep = {
    /** Relativ zum Start: negativ = davor, 0 = der Start selbst. Positive Werte gibt es nicht. */
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

/** Ob ein einzelner Eintrag innerhalb aller Grenzen liegt (Formular-Validierung). */
export function isValidToneStep(step: ToneStep): boolean {
    return (
        Number.isInteger(step.offsetMillis) &&
        step.offsetMillis >= TONE_OFFSET_MIN_MILLIS &&
        step.offsetMillis <= TONE_OFFSET_MAX_MILLIS &&
        Number.isInteger(step.frequencyHz) &&
        step.frequencyHz >= TONE_FREQUENCY_MIN_HZ &&
        step.frequencyHz <= TONE_FREQUENCY_MAX_HZ &&
        Number.isInteger(step.durationMillis) &&
        step.durationMillis >= TONE_DURATION_MIN_MILLIS &&
        step.durationMillis <= TONE_DURATION_MAX_MILLIS &&
        isValidToneRelease(step.releaseMillis)
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
 * Der eingebaute Fehlstart-Ton: deutlich länger und tiefer als alles andere im System, damit er
 * am Wasser sofort als „zurück!" erkennbar ist und nicht mit den kurzen Countdown-Ticks (600 Hz)
 * oder dem Startton (900 Hz) verwechselt werden kann. 440 Hz liegt tief genug für den Kontrast,
 * trägt aber auf kleinen Tablet-Lautsprechern noch; 3000 ms ohne eigene Ausklingzeit heißt: die
 * Lautstärke fällt über die vollen 3 Sekunden exponentiell ab — ein langes, ausklingendes Horn.
 */
export const DEFAULT_FALSE_START_TONE = {frequencyHz: 440, durationMillis: 3000}

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
 * Ob ein Plan inhaltlich dem eingebauten Standard entspricht. Der Editor schickt dann `null`
 * statt des Plans: so bleibt „unkonfiguriert" in der Datenbank unkonfiguriert, und eine künftige
 * Änderung des Standards erreicht auch Typen, deren Plan nie bewusst verstellt wurde.
 */
export function equalsDefaultStartPlan(plan: readonly ToneStep[]): boolean {
    const sorted = sortedTonePlan(plan)
    return (
        sorted.length === DEFAULT_START_TONE_PLAN.length &&
        sorted.every((step, index) => {
            const reference = DEFAULT_START_TONE_PLAN[index]
            return (
                step.offsetMillis === reference.offsetMillis &&
                step.frequencyHz === reference.frequencyHz &&
                step.durationMillis === reference.durationMillis &&
                // Die Hüllkurve zählt EXAKT mit: „Gehalten mit 0 ms" (releaseMillis 0) ist eine
                // andere Klangform als das abfallende `null` — nur `undefined`/`null` sind gleich.
                (step.releaseMillis ?? null) === (reference.releaseMillis ?? null)
            )
        })
    )
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
 * Der wirksame Tonplan einer laufenden Sequenz: Über die Boote der Sequenz wird die Partie der
 * Startliste gefunden (jedes Boot steht in genau einer Partie), und deren aufgelöster
 * Zeitnahmetyp (Runde schlägt Wettkampf — bereits serverseitig aufgelöst) trägt den Plan.
 * Ohne Treffer oder ohne konfigurierten Plan gilt der eingebaute Standard — so klingt ein
 * unkonfigurierter Typ exakt wie bisher.
 */
export function tonePlanForSequence(
    matches: readonly TimingMatchDto[],
    sequence: TimingSequenceDto | undefined,
): ToneStep[] {
    if (sequence !== undefined) {
        const teamIds = new Set(sequence.entries.map(entry => entry.competitionMatchTeam))
        const match = matches.find(candidate =>
            candidate.teams.some(team => teamIds.has(team.competitionMatchTeam)),
        )
        const plan = match?.timingMode?.tonePlan
        if (plan != null && plan.length > 0) return sortedTonePlan(plan)
    }
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
