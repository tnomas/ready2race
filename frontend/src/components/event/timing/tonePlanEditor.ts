import {ToneStep, isValidToneRelease, isValidToneStep, sortedTonePlan} from '@utils/timing/tonePlan.ts'

/**
 * Zeilen-Zustand des Tonplan-Editors (TimingModeDialog): die drei Zahlen als Strings, damit sie
 * beim Tippen vorübergehend leer sein dürfen — dieselbe Begründung wie bei den übrigen
 * Zahlenfeldern des Dialogs. Der Zeitpunkt wird als „Sekunden vor Start" geführt (0 = Start),
 * weil die Regattaleitung so denkt; das Vorzeichen-Millisekunden-Format bleibt der API.
 */
export type ToneRow = {
    /** Stabiler React-Key, unabhängig von Sortierung und Löschungen. */
    key: number
    secondsBeforeStart: string
    frequencyHz: string
    durationMillis: string
    /** Ausklingzeit in ms; leer = keine eigene (Standardhüllkurve, Abfall über die Nenndauer). */
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
        // 0 und „nicht gesetzt" sind dieselbe Hüllkurve — beides zeigt das Feld leer.
        releaseMillis: step.releaseMillis != null && step.releaseMillis !== 0 ? String(step.releaseMillis) : '',
    }
}

export function rowsFromPlan(plan: readonly ToneStep[]): ToneRow[] {
    return sortedTonePlan(plan).map(rowFromStep)
}

/**
 * Eine Zeile zurück in einen Plan-Eintrag, oder null, wenn sie (noch) nicht gültig ist —
 * leere Felder, keine Zahl oder außerhalb der Grenzen aus `tonePlan.ts`. Sekunden dürfen
 * Dezimalstellen tragen (2.5 s vor Start); gerundet wird auf ganze Millisekunden. Das
 * Ausklingen darf leer bleiben (keine eigene Ausklingzeit); leer und 0 werden gleichermaßen
 * zu „nicht gesetzt" normalisiert, damit die API nie ein bedeutungsloses 0 trägt.
 */
export function stepFromRow(row: ToneRow): ToneStep | null {
    const seconds = Number(row.secondsBeforeStart)
    const frequencyHz = Number(row.frequencyHz)
    const durationMillis = Number(row.durationMillis)
    if (row.secondsBeforeStart.trim() === '' || !Number.isFinite(seconds)) return null
    if (row.frequencyHz.trim() === '' || !Number.isInteger(frequencyHz)) return null
    if (row.durationMillis.trim() === '' || !Number.isInteger(durationMillis)) return null
    const releaseText = row.releaseMillis.trim()
    const release = releaseText === '' ? undefined : Number(releaseText)
    if (release !== undefined && (!Number.isInteger(release) || !isValidToneRelease(release))) {
        return null
    }
    // "|| 0" räumt das -0 aus -Math.round(0 * 1000) ab — die API soll echte 0 tragen.
    const step: ToneStep = {
        offsetMillis: -Math.round(seconds * 1000) || 0,
        frequencyHz,
        durationMillis,
        // `release ? …` lässt 0 (und leer) bewusst weg — Normalisierung siehe oben.
        ...(release ? {releaseMillis: release} : {}),
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
