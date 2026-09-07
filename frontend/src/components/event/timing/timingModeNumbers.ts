export type ModeNumbersResult =
    | {ok: true; intervalSeconds: number | null; leadInSeconds: number}
    | {ok: false; field: 'interval' | 'leadIn'}

/**
 * Liest eine Sekundenangabe aus dem Rohtext eines Zahlenfelds: nur ganze Zahlen im erlaubten
 * Bereich, sonst `undefined`. Nachkommastellen werden nicht gerundet — was gespeichert wird,
 * soll das sein, was im Feld steht.
 */
const wholeSeconds = (raw: string, min: number): number | undefined => {
    const trimmed = raw.trim()
    if (trimmed === '') return undefined
    const value = Number(trimmed)
    return Number.isInteger(value) && value >= min ? value : undefined
}

/**
 * Die beiden Zahlenfelder des Zeitnahmetyp-Dialogs. Ein leeres Intervall ist kein Fehler,
 * sondern die bewusste Bedeutung „jeder Start wird von Hand ausgelöst"; ein leerer Vorlauf
 * dagegen schon - er würde sonst still als 0 gelesen. Das Intervall wird zuerst geprüft, damit
 * die Fehlermarkierung dem Leseweg der Maske folgt.
 */
export const validateModeNumbers = (intervalRaw: string, leadInRaw: string): ModeNumbersResult => {
    const intervalSeconds = intervalRaw.trim() === '' ? null : wholeSeconds(intervalRaw, 1)
    if (intervalSeconds === undefined) return {ok: false, field: 'interval'}
    const leadInSeconds = wholeSeconds(leadInRaw, 0)
    if (leadInSeconds === undefined) return {ok: false, field: 'leadIn'}
    return {ok: true, intervalSeconds, leadInSeconds}
}
