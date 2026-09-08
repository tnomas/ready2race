import {MaterialOverviewItemDto, MaterialOverviewMatchDto} from '@api/types.gen.ts'
import {EffectiveAssignment} from './effectiveAssignments.ts'

/**
 * Ohne endTime gilt ein Lauf als 15 Minuten lang (Entscheidung, siehe Spec Abschnitt 9).
 */
export const DEFAULT_MATCH_MINUTES = 15

export type ConflictKind = 'OVERLAP' | 'CHANGEOVER' | 'OUTAGE' | 'RETIRED'

export type MaterialConflict = {
    kind: ConflictKind
    itemId: string
    matchIds: string[]
    requestIds: string[]
}

export const severityOf = (kind: ConflictKind): 'error' | 'warning' => (kind === 'CHANGEOVER' ? 'warning' : 'error')

type Window = {start: number; end: number}

const windowOf = (match: MaterialOverviewMatchDto): Window | null => {
    if (match.startTime == null) {
        return null
    }
    const start = new Date(match.startTime).getTime()
    const end = match.endTime != null ? new Date(match.endTime).getTime() : start + DEFAULT_MATCH_MINUTES * 60_000
    return {start, end}
}

const windowsIntersect = (a: Window, b: Window): boolean => a.start < b.end && b.start < a.end

type ItemOccurrence = {matchId: string; requestId: string; window: Window}

/**
 * Prüft zwei Vorkommen desselben Stücks auf Überlappung oder zu kurzen Wechselabstand. Der
 * spätere Lauf entscheidet über seinen eigenen Wechselzeitbedarf - wer danach kommt, muss die
 * Zeit mitbringen.
 */
const conflictBetween = (
    itemId: string,
    a: ItemOccurrence,
    b: ItemOccurrence,
    changeoverMinutesByRequest: Record<string, number>,
): MaterialConflict | null => {
    const [earlier, later] = a.window.start <= b.window.start ? [a, b] : [b, a]

    if (windowsIntersect(earlier.window, later.window)) {
        return {kind: 'OVERLAP', itemId, matchIds: [earlier.matchId, later.matchId], requestIds: [earlier.requestId, later.requestId]}
    }

    const gapMs = later.window.start - earlier.window.end
    const changeoverMs = (changeoverMinutesByRequest[later.requestId] ?? 0) * 60_000
    if (gapMs < changeoverMs) {
        return {kind: 'CHANGEOVER', itemId, matchIds: [earlier.matchId, later.matchId], requestIds: [earlier.requestId, later.requestId]}
    }

    return null
}

/**
 * Stellt Konflikte je Materialstück fest: OVERLAP/CHANGEOVER zwischen Läufen desselben
 * Stücks, OUTAGE gegen gemeldete Ausfallfenster, RETIRED für stillgelegte Stücke mit
 * wirksamer Zuteilung. Läufe ohne startTime tragen zu OVERLAP/CHANGEOVER/OUTAGE nichts bei,
 * zu RETIRED aber schon - eine Stillegung ist unabhängig vom Zeitplan ein Problem.
 */
export const findConflicts = (
    effective: EffectiveAssignment[],
    matches: MaterialOverviewMatchDto[],
    items: MaterialOverviewItemDto[],
    changeoverMinutesByRequest: Record<string, number>,
): MaterialConflict[] => {
    const matchesById = new Map(matches.map(m => [m.id, m]))
    const itemsById = new Map(items.map(i => [i.id, i]))
    const conflicts: MaterialConflict[] = []

    const occurrencesByItem = new Map<string, ItemOccurrence[]>()
    for (const entry of effective) {
        const match = matchesById.get(entry.matchId)
        const window = match ? windowOf(match) : null
        if (window == null) {
            continue
        }
        for (const itemId of entry.itemIds) {
            const list = occurrencesByItem.get(itemId) ?? []
            list.push({matchId: entry.matchId, requestId: entry.requestId, window})
            occurrencesByItem.set(itemId, list)
        }
    }

    for (const [itemId, occurrences] of occurrencesByItem) {
        for (let i = 0; i < occurrences.length; i++) {
            for (let j = i + 1; j < occurrences.length; j++) {
                const conflict = conflictBetween(itemId, occurrences[i], occurrences[j], changeoverMinutesByRequest)
                if (conflict != null) {
                    conflicts.push(conflict)
                }
            }
        }

        const item = itemsById.get(itemId)
        if (item != null) {
            for (const occurrence of occurrences) {
                for (const outage of item.outages) {
                    const outageWindow: Window = {
                        start: new Date(outage.from).getTime(),
                        end: outage.until != null ? new Date(outage.until).getTime() : Infinity,
                    }
                    if (windowsIntersect(occurrence.window, outageWindow)) {
                        conflicts.push({
                            kind: 'OUTAGE',
                            itemId,
                            matchIds: [occurrence.matchId],
                            requestIds: [occurrence.requestId],
                        })
                    }
                }
            }
        }
    }

    for (const entry of effective) {
        for (const itemId of entry.itemIds) {
            const item = itemsById.get(itemId)
            if (item?.status === 'RETIRED') {
                conflicts.push({kind: 'RETIRED', itemId, matchIds: [entry.matchId], requestIds: [entry.requestId]})
            }
        }
    }

    return conflicts
}
