import {OfficialTimeDto} from '@api/types.gen.ts'

/**
 * Warum aus den Marken eines Teams (noch) keine offizielle Zeit entsteht — die Werte spiegeln die
 * Backend-Klassifikation `OfficialTimeSkipReason`, damit dieselben Begriffe an beiden Enden stehen.
 */
export type OfficialTimeReason =
    | 'NO_START_MARK'
    | 'NO_FINISH_MARK'
    | 'NEGATIVE_DURATION'
    | 'NO_MARKS'

/**
 * Klassifiziert die Marken-Werte des DTO (`startMillis`/`finishMillis`, vom Server aus den aktuell
 * zugeordneten ACTIVE-Marken aufgelöst). Null heißt: die Marken taugen für eine Berechnung — steht
 * trotzdem nichts da, ist das ein transienter Zwischenstand, den die nächste Nachricht auflöst.
 */
export function markReason(
    official: Pick<OfficialTimeDto, 'startMillis' | 'finishMillis'> | undefined,
): OfficialTimeReason | null {
    if (official === undefined) return null
    const {startMillis, finishMillis} = official
    if (startMillis === undefined && finishMillis === undefined) return 'NO_MARKS'
    if (finishMillis === undefined) return 'NO_FINISH_MARK'
    if (startMillis === undefined) return 'NO_START_MARK'
    if (finishMillis < startMillis) return 'NEGATIVE_DURATION'
    return null
}

/**
 * Der Grund für eine leere Berechnet-Spalte. Bewusst unabhängig von Override/Status: ein
 * Hand-Override füllt die Offiziell-Spalte, aber die Berechnung bleibt leer — und die Spalte darf
 * weiterhin sagen, warum.
 */
export function computedReason(official: OfficialTimeDto | undefined): OfficialTimeReason | null {
    if (official?.computedMillis !== undefined) return null
    return markReason(official)
}

/**
 * Der Grund für eine leere offizielle Zeit (Offiziell-Spalte, Übersichts-Tabelle). Schweigt, wenn
 * ein Status (DNS/DNF/DSQ) oder eine Zeit die Zeile bereits erklärt.
 */
export function effectiveReason(official: OfficialTimeDto | undefined): OfficialTimeReason | null {
    if (official === undefined) return null
    if (official.resultStatus !== 'NONE') return null
    if (official.effectiveMillis !== undefined) return null
    return markReason(official)
}

/**
 * Der Grund an der Zeit-am-Boot im Ziel-Board. Nur die Fälle, die dort keine Selbstverständlichkeit
 * sind: „kein Ziel" hätte vor dem Zieleinlauf jedes Boot, „keine Zeitmarken" jedes Boot vor seinem
 * Rennen — übrig bleiben „kein Start" und „Start nach Ziel", die der Zielposten wirklich wissen muss.
 */
export function boatReason(official: OfficialTimeDto | undefined): OfficialTimeReason | null {
    const reason = effectiveReason(official)
    return reason === 'NO_START_MARK' || reason === 'NEGATIVE_DURATION' ? reason : null
}
