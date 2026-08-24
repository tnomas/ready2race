import {
    ToneStep,
    ToneWaveform,
    isValidToneRelease,
    isValidToneStep,
    sortedTonePlan,
} from '@utils/timing/tonePlan.ts'

/** Die Hüllkurven-Wahl einer Editor-Zeile — sichtbar statt als versteckte Zahlen-Fuge. */
export type ToneEnvelopeChoice = 'DECAY' | 'HELD'

/**
 * Zeilen-Zustand des Tonplan-Editors (TimingModeDialog): die Zahlen als Strings, damit sie
 * beim Tippen vorübergehend leer sein dürfen — dieselbe Begründung wie bei den übrigen
 * Zahlenfeldern des Dialogs. Der Zeitpunkt wird als „Sekunden vor Start" geführt (0 = Start),
 * weil die Regattaleitung so denkt; das Vorzeichen-Millisekunden-Format bleibt der API.
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
    secondsBeforeStart: string
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

export function rowFromStep(step: ToneStep): ToneRow {
    return {
        key: nextKey++,
        // -0 vermeiden: der Start selbst ist "0", nicht "-0".
        secondsBeforeStart: String(step.offsetMillis === 0 ? 0 : -step.offsetMillis / 1000),
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

export function rowsFromPlan(plan: readonly ToneStep[]): ToneRow[] {
    return sortedTonePlan(plan).map(rowFromStep)
}

/**
 * Eine Zeile zurück in einen Plan-Eintrag, oder null, wenn sie (noch) nicht gültig ist —
 * leere Felder, keine Zahl oder außerhalb der Grenzen aus `tonePlan.ts`. Sekunden dürfen
 * Dezimalstellen tragen (2.5 s vor Start); gerundet wird auf ganze Millisekunden.
 *
 * Hüllkurve: „Abfallend" schickt NIE ein `releaseMillis` (ein etwaiger Feldrest wird ignoriert,
 * er hat in dem Modus keine Bedeutung); „Gehalten" verlangt eine ganze Zahl 0–5000 — auch 0
 * geht als echter Wert an die API, denn 0 heißt jetzt „Gehalten mit Sofort-Ausklang", nicht
 * „keine Angabe".
 */
export function stepFromRow(row: ToneRow): ToneStep | null {
    const seconds = Number(row.secondsBeforeStart)
    const frequencyHz = Number(row.frequencyHz)
    const durationMillis = Number(row.durationMillis)
    if (row.secondsBeforeStart.trim() === '' || !Number.isFinite(seconds)) return null
    if (row.frequencyHz.trim() === '' || !Number.isInteger(frequencyHz)) return null
    if (row.durationMillis.trim() === '' || !Number.isInteger(durationMillis)) return null
    let release: number | undefined
    if (row.envelope === 'HELD') {
        const releaseText = row.releaseMillis.trim()
        if (releaseText === '') return null
        release = Number(releaseText)
        if (!Number.isInteger(release) || !isValidToneRelease(release)) return null
    }
    // "|| 0" räumt das -0 aus -Math.round(0 * 1000) ab — die API soll echte 0 tragen.
    const step: ToneStep = {
        offsetMillis: -Math.round(seconds * 1000) || 0,
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
    return isValidToneStep(step) ? step : null
}

/** Alle Zeilen gültig -> sortierter Plan; sonst null (der Dialog markiert die kaputten Zeilen). */
export function planFromRows(rows: readonly ToneRow[]): ToneStep[] | null {
    const steps: ToneStep[] = []
    for (const row of rows) {
        const step = stepFromRow(row)
        if (step === null) return null
        steps.push(step)
    }
    return sortedTonePlan(steps)
}
