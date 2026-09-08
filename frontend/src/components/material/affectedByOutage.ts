import {MaterialOverviewItemDto, MaterialOverviewMatchDto} from '@api/types.gen.ts'
import {EffectiveAssignment} from './effectiveAssignments.ts'
import {Window, windowOf, windowsIntersect} from './conflicts.ts'

export type OutageImpact = {requestId: string; matchId: string}

/**
 * Wirksame Zuteilungen dieses Stücks, deren Lauffenster das gemeldete Ausfallfenster
 * schneiden - genau die Läufe, die einen Ersatz brauchen. `until` offen heißt: für immer,
 * bis jemand den Schaden repariert.
 */
export const affectedByOutage = (
    effective: EffectiveAssignment[],
    matches: MaterialOverviewMatchDto[],
    itemId: string,
    from: string,
    until?: string,
): OutageImpact[] => {
    const matchesById = new Map(matches.map(m => [m.id, m]))
    const outageWindow: Window = {
        start: new Date(from).getTime(),
        end: until != null ? new Date(until).getTime() : Infinity,
    }

    const result: OutageImpact[] = []
    for (const entry of effective) {
        if (!entry.itemIds.includes(itemId)) {
            continue
        }
        const match = matchesById.get(entry.matchId)
        const window = match ? windowOf(match) : null
        if (window != null && windowsIntersect(window, outageWindow)) {
            result.push({requestId: entry.requestId, matchId: entry.matchId})
        }
    }
    return result
}

export type ReplacementCandidate = {item: MaterialOverviewItemDto; sameNumber: boolean}

/**
 * Ersatzstücke für einen Lauf: aktiv, richtige Materialart, im Lauffenster weder anderweitig
 * zugeteilt noch im Ausfall. Nummerngleichheit mit der Startnummer des Teams kommt zuerst -
 * das ist meist der naheliegendste Tausch (eigenes Ersatzboot mit gleicher Nummer).
 */
export const replacementCandidates = (
    items: MaterialOverviewItemDto[],
    effective: EffectiveAssignment[],
    matches: MaterialOverviewMatchDto[],
    matchId: string,
    materialType: string,
    teamNumber: number | undefined,
): ReplacementCandidate[] => {
    const matchesById = new Map(matches.map(m => [m.id, m]))
    const targetMatch = matchesById.get(matchId)
    const targetWindow = targetMatch ? windowOf(targetMatch) : null
    if (targetWindow == null) {
        return []
    }

    const occurrencesByItem = new Map<string, Window[]>()
    for (const entry of effective) {
        const match = matchesById.get(entry.matchId)
        const window = match ? windowOf(match) : null
        if (window == null) {
            continue
        }
        for (const id of entry.itemIds) {
            const list = occurrencesByItem.get(id) ?? []
            list.push(window)
            occurrencesByItem.set(id, list)
        }
    }

    const candidates = items.filter(item => {
        if (item.status !== 'ACTIVE' || item.materialType !== materialType) {
            return false
        }
        const busy = (occurrencesByItem.get(item.id) ?? []).some(window =>
            windowsIntersect(window, targetWindow),
        )
        if (busy) {
            return false
        }
        const inOutage = item.outages.some(outage => {
            const outageWindow: Window = {
                start: new Date(outage.from).getTime(),
                end: outage.until != null ? new Date(outage.until).getTime() : Infinity,
            }
            return windowsIntersect(outageWindow, targetWindow)
        })
        return !inOutage
    })

    return candidates
        .map(item => ({item, sameNumber: teamNumber != null && item.number === teamNumber}))
        .sort((a, b) => {
            if (a.sameNumber !== b.sameNumber) {
                return a.sameNumber ? -1 : 1
            }
            return (a.item.number ?? Infinity) - (b.item.number ?? Infinity)
        })
}
