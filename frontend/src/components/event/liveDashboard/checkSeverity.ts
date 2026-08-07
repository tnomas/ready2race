import {
    CheckSeverity,
    CheckSeverityCompetitionDto,
    CheckSeverityConfigDto,
    CheckSeverityEntryDto,
    CheckSeverityRowDto,
} from '@api/types.gen.ts'

export type RowSummary =
    | {kind: 'uniform'; severity: CheckSeverity}
    | {kind: 'mixed'}
    | {kind: 'empty'}

/**
 * Der verdichtete Zustand einer Zeile. Er steht eingeklappt neben dem Namen der Prüfung und
 * beantwortet die einzige Frage, die man ohne Aufklappen hat: Ist hier vom Standard abgewichen
 * worden, und wenn ja, überall gleich?
 *
 * Ohne Wettkämpfe gibt es nichts zu verdichten - "leer" ist dafür die eigene, dritte Antwort
 * (nicht "gemischt", das wäre falsch, und keine Ausnahme, damit ein Renderpfad ohne
 * Wettkämpfe nicht die ganze Seite mitreißt). Was für "leer" angezeigt wird, entscheidet der
 * Aufrufer.
 */
export const rowSummary = (severities: CheckSeverity[]): RowSummary => {
    if (severities.length === 0) {
        return {kind: 'empty'}
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

/**
 * Der eingestellte Wert eines Feldes der Matrix, sonst der vom Server gelieferte Standard.
 *
 * Der letzte `?? 'CRITICAL'` ist keine dritte, dokumentierte Stufe, sondern eine Notbremse: Sie
 * greift nur, wenn weder ein Eintrag noch ein Standard zur Kombination passt - ein Zustand, der
 * bei widersprüchlichen Serverdaten entstehen kann (z.B. eine Zeile ohne zugehörigen Standard),
 * im Normalbetrieb aber nicht vorkommen sollte.
 */
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

/**
 * Ob ein gespeicherter Eintrag zu einer Kombination gehört, die noch einstellbar ist. Anders als
 * `isRowApplicable` bekommt diese Funktion keine passende Zeile mitgegeben, sondern sucht sich
 * den Wettkampf selbst - ein Eintrag zu einem inzwischen nicht mehr existierenden Wettkampf ist
 * damit ebenfalls nicht (mehr) anwendbar und wird wie die anderen bewahrt statt bearbeitet.
 */
const isEntryApplicable = (
    entry: Pick<CheckSeverityEntryDto, 'checkType' | 'competitionId'>,
    competitions: CheckSeverityCompetitionDto[],
): boolean => {
    const competition = competitions.find(c => c.competitionId === entry.competitionId)
    return competition !== undefined && isRowApplicable(entry, competition)
}

/**
 * Die gespeicherten Einträge, die zu keiner mehr einstellbaren Kombination gehören - etwa "Nicht
 * auf dem Wasser" für einen Wettkampf, dessen `checkInOutRequired` inzwischen auf `false` steht.
 * Der Dialog zeigt sie nicht an und lässt sie nicht bearbeiten, muss sie aber beim Speichern
 * unverändert an die Nutzlast anhängen - sonst ersetzt `replaceForEvent` sie durch den Standard
 * und der zuvor eingestellte Wert ist unwiederbringlich weg.
 */
export const preservedEntries = (config: CheckSeverityConfigDto): CheckSeverityEntryDto[] =>
    config.entries.filter(e => !isEntryApplicable(e, config.competitions))

const entryKey = (
    e: Pick<CheckSeverityEntryDto, 'competitionId' | 'checkType' | 'requirementId'>,
) => `${e.competitionId}:${e.checkType}:${e.requirementId ?? ''}`

/**
 * Die Nutzlast fürs Speichern: die bearbeitete Matrix, ergänzt um die bewahrten Einträge nicht
 * (mehr) anwendbarer Kombinationen. Ein bewahrter Eintrag, der - z.B. durch eine zwischenzeitliche
 * Änderung der Wettkampf-Flags - inzwischen doch schon in der Matrix steckt, wird nicht noch
 * einmal angehängt: Das Backend lehnt doppelte Einträge derselben Kombination ab.
 */
export const buildSavePayload = (
    entries: CheckSeverityEntryDto[],
    preserved: CheckSeverityEntryDto[],
): CheckSeverityEntryDto[] => {
    const keys = new Set(entries.map(entryKey))
    return [...entries, ...preserved.filter(e => !keys.has(entryKey(e)))]
}
