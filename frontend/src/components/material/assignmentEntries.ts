import {MaterialAssignmentDto, MaterialAssignmentEntry} from '@api/types.gen.ts'

/**
 * Eine Änderung an den Zuteilungen einer Anfrage. `setMaterialAssignments` ersetzt immer die
 * komplette Liste; diese Datei ist die eine Stelle, die aus dem bekannten Stand und der Änderung
 * die neue Komplettliste baut (Einteilung nach Team, Ausnahme-Dialog, Ersatz nach Ausfall,
 * „Nach Meldungsnummer zuteilen").
 */
export type AssignmentChange =
    /** Grundzuteilung ersetzen; Ausnahmen je Lauf bleiben. */
    | {kind: 'setBase'; itemIds: readonly string[]}
    /** Stücke zur Grundzuteilung hinzufügen. */
    | {kind: 'addBase'; itemIds: readonly string[]}
    /** Eine bestehende Zuteilung (Grund oder Ausnahme) entfernen. */
    | {kind: 'remove'; assignmentId: string}
    /** Eine Ausnahme für einen Lauf hinzufügen. */
    | {kind: 'addException'; matchId: string; itemId: string}
    /**
     * Im Lauf ein Stück gegen ein anderes tauschen (Ersatz nach Ausfall): Die im Lauf wirksamen
     * Stücke (Ausnahmen, sonst die Grundzuteilung) werden zur Ausnahme dieses Laufs, mit dem
     * Ersatz an der Stelle des ausgefallenen Stücks. Weitere Stücke derselben Anfrage bleiben.
     */
    | {kind: 'replaceInMatch'; matchId: string; oldItemId: string; newItemId: string}

const entry = (materialItem: string, competitionMatch?: string | null): MaterialAssignmentEntry =>
    competitionMatch != null ? {materialItem, competitionMatch} : {materialItem}

const toEntry = (a: Pick<MaterialAssignmentDto, 'materialItem' | 'competitionMatch'>) =>
    entry(a.materialItem, a.competitionMatch)

/** Gleiche Paare aus Stück und Lauf nur einmal – das Backend weist Doppelte ab. */
const unique = (entries: MaterialAssignmentEntry[]): MaterialAssignmentEntry[] => {
    const seen = new Set<string>()
    return entries.filter(e => {
        const key = `${e.materialItem}|${e.competitionMatch ?? ''}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
    })
}

export const assignmentEntriesAfter = (
    assignments: readonly MaterialAssignmentDto[],
    change: AssignmentChange,
): MaterialAssignmentEntry[] => {
    const base = assignments.filter(a => a.competitionMatch == null)
    const exceptions = assignments.filter(a => a.competitionMatch != null)

    switch (change.kind) {
        case 'setBase':
            return unique([...change.itemIds.map(id => entry(id)), ...exceptions.map(toEntry)])
        case 'addBase':
            return unique([...assignments.map(toEntry), ...change.itemIds.map(id => entry(id))])
        case 'remove':
            return unique(assignments.filter(a => a.id !== change.assignmentId).map(toEntry))
        case 'addException':
            return unique([...assignments.map(toEntry), entry(change.itemId, change.matchId)])
        case 'replaceInMatch': {
            const inMatch = exceptions.filter(a => a.competitionMatch === change.matchId)
            const effective = (inMatch.length > 0 ? inMatch : base).map(a => a.materialItem)
            const replaced = effective.includes(change.oldItemId)
                ? effective.map(id => (id === change.oldItemId ? change.newItemId : id))
                : [...effective.filter(id => id !== change.newItemId), change.newItemId]
            return unique([
                ...assignments.filter(a => a.competitionMatch !== change.matchId).map(toEntry),
                ...replaced.map(id => entry(id, change.matchId)),
            ])
        }
    }
}
