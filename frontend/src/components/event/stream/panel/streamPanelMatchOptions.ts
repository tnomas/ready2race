/** Die schmale Teilmenge von `LiveMatchInfo`, die die Beschriftung tatsächlich braucht. */
export type MatchLabelInfo = {
    competitionName: string
    roundName?: string | null
    matchName?: string | null
}

/**
 * Laufbezeichnung für den Lauf-Wähler im Panel: „10:30 | 12 JM4x Vorlauf 3" — Zeit vor
 * Wettkampf/Runde/Lauf, dieselbe Reihenfolge wie der Sammelexport
 * (`ScheduleStartlistExportButton.matchLabel`), nur mit vorangestellter Zeit statt einer
 * eigenen Spalte. Die Zeit kommt bereits fertig formatiert herein — reine Funktion, kein
 * `date-fns` hier.
 */
export const matchOptionLabel = (match: MatchLabelInfo, timeLabel: string | null): string => {
    const label = [match.competitionName, match.roundName, match.matchName]
        .filter(Boolean)
        .join(' ')
    return timeLabel ? `${timeLabel} | ${label}` : label
}
