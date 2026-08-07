import {CheckSeverity, CheckSeverityConfigDto, CheckSeverityEntryDto} from '@api/types.gen.ts'

export type RowSummary = {kind: 'uniform'; severity: CheckSeverity} | {kind: 'mixed'}

/**
 * Der verdichtete Zustand einer Zeile. Er steht eingeklappt neben dem Namen der Prüfung und
 * beantwortet die einzige Frage, die man ohne Aufklappen hat: Ist hier vom Standard abgewichen
 * worden, und wenn ja, überall gleich?
 */
export const rowSummary = (severities: CheckSeverity[]): RowSummary =>
    severities.length > 0 && severities.every(s => s === severities[0])
        ? {kind: 'uniform', severity: severities[0]}
        : {kind: 'mixed'}

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
