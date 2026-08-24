import {
    ToneOffsetDirection,
    ToneStep,
    ToneWaveform,
    isValidToneRelease,
    isValidToneStep,
    sortedTonePlan,
    toneTotalMillis,
} from '@utils/timing/tonePlan.ts'

/** Die Hüllkurven-Wahl einer Editor-Zeile — sichtbar statt als versteckte Zahlen-Fuge. */
export type ToneEnvelopeChoice = 'DECAY' | 'HELD'

/**
 * Was eine Editor-Zeile über ihren Zeitpunkt weiß. `null` heißt „kein Zeitpunkt" — der
 * Einzelton-Fall (Erfassungstöne): dieselbe Zeilendarstellung, nur ohne Zeit-Spalte und ohne
 * „Ton hinzufügen". Sonst der Bezugspunkt der Folge (siehe [ToneOffsetDirection]), der zugleich
 * die EINHEIT des Eingabefelds bestimmt:
 *
 * - `BEFORE_START`: Sekunden VOR dem Start (0 = Start) — so denkt die Regattaleitung über einen
 *   Countdown, und Dezimalstellen (2.5 s) sind erlaubt.
 * - `AFTER_TRIGGER`: Millisekunden NACH der Auslösung — hier zählt das feine Raster („kurz, kurz,
 *   lang" liegt 400 ms auseinander), Sekunden wären als Eingabe zu grob.
 *
 * Das Vorzeichen-Millisekunden-Format bleibt in beiden Fällen der API vorbehalten.
 */
export type ToneRowDirection = ToneOffsetDirection | null

/**
 * Zeilen-Zustand des Tonfolge-Editors: die Zahlen als Strings, damit sie beim Tippen
 * vorübergehend leer sein dürfen — dieselbe Begründung wie bei den übrigen Zahlenfeldern des
 * Dialogs.
 *
 * Die Hüllkurve ist eine EIGENE, sichtbare Wahl je Zeile: „Abfallend" (Abfall über die gesamte
 * Nenndauer, kein Ausklingen-Feld) oder „Gehalten" (volle Lautstärke über die Nenndauer, dann
 * Ausklingen über [releaseMillis] ms — 0 ist dabei ein legitimer Wert). Früher entschied allein
 * die Zahl: 0/leer sprang aufs alte Modell, 1 aufs neue — ein kompletter Klangwechsel zwischen
 * zwei Nachbarwerten, als Bedienung eine Falle.
 */
export type ToneRow = {
    /** Stabiler React-Key, unabhängig von Sortierung und Löschungen. */
    key: number
    /**
     * Der Zeitpunkt als getippter Text; die Einheit hängt an der Richtung (siehe
     * [ToneRowDirection]). Im Einzelton-Fall unbenutzt.
     */
    offsetInput: string
    frequencyHz: string
    durationMillis: string
    envelope: ToneEnvelopeChoice
    /**
     * Die Wellenform der Zeile — im Editor immer konkret (nicht gesetzt kommt als `'SINE'`
     * hoch); beim Zurückschreiben wird `'SINE'` wieder zu „nicht gesetzt" (siehe [stepFromRow]).
     */
    waveform: ToneWaveform
    /** Ausklingzeit in ms; nur bei `envelope === 'HELD'` von Bedeutung (dort Pflichtfeld). */
    releaseMillis: string
}

let nextKey = 1

/** Der Zeitpunkt eines Tons als Feldinhalt, passend zur Richtung. */
function offsetInputFromStep(offsetMillis: number, direction: ToneRowDirection): string {
    if (direction === null) return ''
    if (direction === 'AFTER_TRIGGER') return String(offsetMillis)
    // -0 vermeiden: der Start selbst ist "0", nicht "-0".
    return String(offsetMillis === 0 ? 0 : -offsetMillis / 1000)
}

export function rowFromStep(step: ToneStep, direction: ToneRowDirection = 'BEFORE_START'): ToneRow {
    return {
        key: nextKey++,
        offsetInput: offsetInputFromStep(step.offsetMillis, direction),
        frequencyHz: String(step.frequencyHz),
        durationMillis: String(step.durationMillis),
        // null = Abfallend; jede Zahl (auch 0!) = Gehalten — 0 wird NICHT mehr wegnormalisiert,
        // sonst käme ein gespeicherter Gehalten-0-Ton als Abfallend wieder hoch.
        envelope: step.releaseMillis != null ? 'HELD' : 'DECAY',
        // Nicht gesetzt = Sinus: die Zeile zeigt die Form immer konkret an.
        waveform: step.waveform ?? 'SINE',
        releaseMillis: step.releaseMillis != null ? String(step.releaseMillis) : '',
    }
}

export function rowsFromPlan(
    plan: readonly ToneStep[],
    direction: ToneRowDirection = 'BEFORE_START',
): ToneRow[] {
    return sortedTonePlan(plan).map(step => rowFromStep(step, direction))
}

/** Der Zeitpunkt aus dem Feldinhalt in API-Millisekunden, oder null bei unbrauchbarer Eingabe. */
function offsetMillisFromInput(input: string, direction: ToneRowDirection): number | null {
    // Ohne Zeitpunkt-Spalte (Einzelton) liegt der Ton definitionsgemäß bei 0.
    if (direction === null) return 0
    if (input.trim() === '') return null
    const value = Number(input)
    if (!Number.isFinite(value)) return null
    if (direction === 'AFTER_TRIGGER') {
        // Millisekunden direkt; halbe Millisekunden gibt es nicht.
        return Number.isInteger(value) ? value : null
    }
    // Sekunden vor Start: Dezimalstellen erlaubt (2.5 s), gerundet auf ganze Millisekunden.
    // "|| 0" räumt das -0 aus -Math.round(0 * 1000) ab — die API soll echte 0 tragen.
    return -Math.round(value * 1000) || 0
}

/**
 * Eine Zeile zurück in einen Folgen-Eintrag, oder null, wenn sie (noch) nicht gültig ist —
 * leere Felder, keine Zahl oder außerhalb der Grenzen aus `tonePlan.ts` (das Offset-Fenster
 * hängt an der Richtung).
 *
 * Hüllkurve: „Abfallend" schickt NIE ein `releaseMillis` (ein etwaiger Feldrest wird ignoriert,
 * er hat in dem Modus keine Bedeutung); „Gehalten" verlangt eine ganze Zahl 0–5000 — auch 0
 * geht als echter Wert an die API, denn 0 heißt jetzt „Gehalten mit Sofort-Ausklang", nicht
 * „keine Angabe".
 */
export function stepFromRow(
    row: ToneRow,
    direction: ToneRowDirection = 'BEFORE_START',
): ToneStep | null {
    const offsetMillis = offsetMillisFromInput(row.offsetInput, direction)
    const frequencyHz = Number(row.frequencyHz)
    const durationMillis = Number(row.durationMillis)
    if (offsetMillis === null) return null
    if (row.frequencyHz.trim() === '' || !Number.isInteger(frequencyHz)) return null
    if (row.durationMillis.trim() === '' || !Number.isInteger(durationMillis)) return null
    let release: number | undefined
    if (row.envelope === 'HELD') {
        const releaseText = row.releaseMillis.trim()
        if (releaseText === '') return null
        release = Number(releaseText)
        if (!Number.isInteger(release) || !isValidToneRelease(release)) return null
    }
    const step: ToneStep = {
        offsetMillis,
        frequencyHz,
        durationMillis,
        // `!== undefined` statt Truthiness: die Gehalten-0 muss mitgehen.
        ...(release !== undefined ? {releaseMillis: release} : {}),
        // Explizites SINE wird zu „nicht gesetzt" normalisiert. Das ist hier — anders als beim
        // releaseMillis, wo 0 und null verschiedene Hüllkurven wählen — verlustfrei: SINE und
        // „nicht gesetzt" spielen denselben Oszillatortyp mit demselben Formfaktor (siehe
        // oscillatorType/toneGain in tonePlan.ts), es gibt also keine Bedeutung zu verschlucken.
        // So bleibt „unkonfiguriert" in der Datenbank unkonfiguriert, konsistent zur
        // Plan-Normalisierung (equalsDefaultStartPlan -> null).
        ...(row.waveform !== 'SINE' ? {waveform: row.waveform} : {}),
    }
    // Der Einzelton-Fall hat kein eigenes Offset-Fenster; 0 liegt in beiden.
    return isValidToneStep(step, direction ?? 'BEFORE_START') ? step : null
}

/** Alle Zeilen gültig -> sortierte Folge; sonst null (der Editor markiert die kaputten Zeilen). */
export function planFromRows(
    rows: readonly ToneRow[],
    direction: ToneRowDirection = 'BEFORE_START',
): ToneStep[] | null {
    const steps: ToneStep[] = []
    for (const row of rows) {
        const step = stepFromRow(row, direction)
        if (step === null) return null
        steps.push(step)
    }
    return sortedTonePlan(steps)
}

// --- Zeilen-Zusammenfassung ----------------------------------------------------------------------

/**
 * Der Zeitpunkt einer Zeile als Beschriftung — bewusst KEIN fertiger Text: die 0 ist in beiden
 * Richtungen ein benannter Sonderfall („Start" bzw. „sofort"), und benannt wird in der Sprache
 * des Benutzers. Die Funktion liefert deshalb entweder das Zeichen-Etikett oder den Hinweis,
 * dass hier das übersetzte Wort für „null" hingehört.
 */
export type ToneOffsetLabel = {kind: 'ZERO'} | {kind: 'VALUE'; text: string}

/** Ganze Zahlen ohne Nachkomma, Bruchteile mit — „1.5" statt „1.5000", „5" statt „5.0". */
function trimmedSeconds(millis: number): string {
    const seconds = millis / 1000
    return Number.isInteger(seconds) ? String(seconds) : String(Number(seconds.toFixed(3)))
}

/**
 * Einheit nach Größenordnung statt fest: unter einer Sekunde in ms (das Raster einer
 * Fehlstart-Folge liegt bei 400 ms), ab einer Sekunde in s (ein Countdown bei −5 s). Das
 * Vorzeichen zeigt die Richtung an — „−5 s" vor dem Start, „+400 ms" nach der Auslösung.
 */
export function toneOffsetLabel(offsetMillis: number): ToneOffsetLabel {
    if (offsetMillis === 0) return {kind: 'ZERO'}
    const magnitude = Math.abs(offsetMillis)
    const value = magnitude < 1000 ? `${magnitude} ms` : `${trimmedSeconds(magnitude)} s`
    // Typografisches Minus (U+2212), kein Bindestrich: dieselbe Schreibweise wie in den
    // Vorlagen-Beschriftungen („10−5−4−3−2−1−Start").
    return {kind: 'VALUE', text: `${offsetMillis < 0 ? '−' : '+'}${value}`}
}

/**
 * Die Klanggestalt einer Zeile in EINER Zeile: „+400 ms · Sägezahn · 200 Hz · 300 ms · gehalten".
 * Die übersetzten Wörter kommen von außen (Wellenform, Hüllkurve, und der Zeitpunkt-Sonderfall
 * 0), damit die Zusammensetzung selbst pur und prüfbar bleibt.
 *
 * Reihenfolge mit Absicht: erst WANN (das trägt die Zeitleiste darüber), dann WOMIT (Wellenform),
 * dann die beiden Zahlen, zuletzt die Hüllkurve — beim Überfliegen einer Liste sucht das Auge
 * zuerst den Zeitpunkt und die Tonhöhe.
 */
export function formatToneSummary(parts: {
    /** Fertig übersetzter Zeitpunkt, oder null im Einzelton-Fall (dann fehlt die Spalte ganz). */
    offsetText: string | null
    waveformText: string
    /**
     * Zahl oder roher Feldinhalt: eine Zeile, in der gerade getippt wird, hat noch keine gültige
     * Zahl — dann steht der Text so da, wie er im Feld steht, statt eines „NaN".
     */
    frequencyHz: number | string
    durationMillis: number | string
    envelopeText: string
}): string {
    return [
        parts.offsetText,
        parts.waveformText,
        `${parts.frequencyHz} Hz`,
        `${parts.durationMillis} ms`,
        parts.envelopeText,
    ]
        .filter((piece): piece is string => piece !== null)
        .join(' · ')
}

// --- Zeitleiste ----------------------------------------------------------------------------------

/** Ein Balken der Zeitleiste, in Prozent der Gesamtbreite. */
export type ToneBar = {
    /** Der Schlüssel der Zeile, zu der der Balken gehört — Klick wählt genau diese aus. */
    key: number
    leftPercent: number
    widthPercent: number
}

export type ToneTimeline = {
    /** Frühester Zeitpunkt der Folge in ms (API-Vorzeichen) — der linke Rand der Achse. */
    startMillis: number
    /** Spätester Moment, an dem noch etwas klingt — der rechte Rand. */
    endMillis: number
    bars: ToneBar[]
}

/**
 * Mindestbreite eines Balkens in Prozent. Ein 20-ms-Piep neben einem 10-Sekunden-Ton wäre sonst
 * ein Strich von 0.2 % — unsichtbar und nicht anklickbar. Die Verzerrung ist der Preis dafür,
 * dass die Zeitleiste BEDIENBAR ist und nicht nur hübsch.
 */
export const TONE_BAR_MIN_WIDTH_PERCENT = 1.5

/**
 * Die Geometrie der kleinen Zeitleiste über der Liste: jeder Ton ein Balken, die Position
 * proportional zu seinem Zeitpunkt, die Breite proportional zu seiner Gesamtklanglänge
 * (Nenndauer + Ausklingen). Damit ist das Muster „kurz — kurz — lang" bzw. der Rhythmus eines
 * Countdowns auf einen Blick sichtbar, ohne eine einzige Zahl zu lesen.
 *
 * Die Achse spannt vom frühesten Zeitpunkt bis zum spätesten Moment, an dem noch etwas klingt —
 * NICHT bis zum letzten Zeitpunkt: ein langer Schlusston würde sonst rechts aus dem Bild laufen.
 * Balken dürfen sich überlappen (überlappende Töne sind erlaubt und klingen zusammen), und kein
 * Balken läuft über den rechten Rand hinaus.
 *
 * Eine leere Folge hat keine Balken und eine Achse der Länge 0 — die Komponente zeigt dann nichts.
 */
export function toneTimelineGeometry(
    entries: readonly {key: number; step: ToneStep}[],
): ToneTimeline {
    if (entries.length === 0) return {startMillis: 0, endMillis: 0, bars: []}
    const startMillis = Math.min(...entries.map(entry => entry.step.offsetMillis))
    const endMillis = Math.max(
        ...entries.map(entry => entry.step.offsetMillis + toneTotalMillis(entry.step)),
    )
    const span = endMillis - startMillis
    // Kann im Betrieb nicht auftreten (Dauer ist mindestens 20 ms), aber eine Division durch 0
    // wäre ein NaN im Stil-Attribut — lieber ein voller Balken je Ton.
    if (span <= 0) {
        return {
            startMillis,
            endMillis,
            bars: entries.map(entry => ({key: entry.key, leftPercent: 0, widthPercent: 100})),
        }
    }
    return {
        startMillis,
        endMillis,
        bars: entries.map(entry => {
            const leftPercent = ((entry.step.offsetMillis - startMillis) / span) * 100
            const rawWidth = (toneTotalMillis(entry.step) / span) * 100
            const widthPercent = Math.min(
                Math.max(rawWidth, TONE_BAR_MIN_WIDTH_PERCENT),
                100 - leftPercent,
            )
            return {key: entry.key, leftPercent, widthPercent}
        }),
    }
}
