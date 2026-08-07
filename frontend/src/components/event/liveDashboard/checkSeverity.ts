import {
    CheckSeverity,
    CheckSeverityCompetitionDto,
    CheckSeverityConfigDto,
    CheckSeverityEntryDto,
    CheckSeverityRowDto,
} from '@api/types.gen.ts'

export type RowSummary = {kind: 'uniform'; severity: CheckSeverity} | {kind: 'mixed'}

/**
 * Der verdichtete Zustand einer Zeile. Er steht eingeklappt neben dem Namen der Prüfung und
 * beantwortet die einzige Frage, die man ohne Aufklappen hat: Ist hier vom Standard abgewichen
 * worden, und wenn ja, überall gleich?
 *
 * Setzt mindestens einen Wettkampf voraus - ohne Wettkämpfe gibt es nichts zu verdichten, und
 * "gemischt" wäre dafür die falsche Antwort. Der Aufrufer muss diesen Fall vorher abfangen.
 */
export const rowSummary = (severities: CheckSeverity[]): RowSummary => {
    if (severities.length === 0) {
        throw new Error('rowSummary requires at least one severity')
    }
    return severities.every(s => s === severities[0])
        ? {kind: 'uniform', severity: severities[0]}
        : {kind: 'mixed'}
}

/**
 * Wettkämpfe ohne `checkInOutRequired` gehören für die Prüfung "Nicht auf dem Wasser" gar nicht
 * erst in die Matrix - dort gibt es nichts einzustellen. Für alle anderen Prüfungen ist jeder
 * Wettkampf anwendbar.
 */
export const isRowApplicable = (
    row: Pick<CheckSeverityRowDto, 'checkType'>,
    competition: Pick<CheckSeverityCompetitionDto, 'checkInOutRequired'>,
): boolean => row.checkType !== 'NOT_ON_WATER' || competition.checkInOutRequired

/** Der eingestellte Wert eines Feldes der Matrix, sonst der vom Server gelieferte Standard. */
export const severityAt = (
    config: CheckSeverityConfigDto,
    entries: CheckSeverityEntryDto[],
    competitionId: string,
    checkType: CheckSeverityEntryDto['checkType'],
    requirementId: string | null,
): CheckSeverity =>
    entries.find(
        e =>
            e.competitionId === competitionId &&
            e.checkType === checkType &&
            (e.requirementId ?? null) === requirementId,
    )?.severity ??
    config.defaults.find(
        d => d.checkType === checkType && (d.requirementId ?? null) === requirementId,
    )?.severity ??
    'CRITICAL'
