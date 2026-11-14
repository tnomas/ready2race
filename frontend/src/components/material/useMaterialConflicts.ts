import {useMemo} from 'react'
import {MaterialOverviewDto} from '@api/types.gen.ts'
import {effectiveAssignments} from './effectiveAssignments.ts'
import {findConflicts, MaterialConflict} from './conflicts.ts'

/**
 * Wechselzeit je Anfrage aus ihrem Angebot; ohne Angebot 0 Minuten.
 */
export const changeoverMinutesByRequest = (
    overview: Pick<MaterialOverviewDto, 'requests' | 'offers'>,
): Record<string, number> => {
    const byOffer = new Map(overview.offers.map(o => [o.id, o.changeoverMinutes]))
    return Object.fromEntries(overview.requests.map(r => [r.id, byOffer.get(r.materialOffer) ?? 0]))
}

/**
 * Konflikte der Einteilung, einmal je Übersicht berechnet (Reiterkopf und beide Sichten der
 * Zuteilung lesen dieselbe Liste).
 */
export const useMaterialConflicts = (
    overview: MaterialOverviewDto | undefined,
): MaterialConflict[] =>
    useMemo(() => {
        if (!overview) return []
        const effective = effectiveAssignments(overview.requests, overview.matches)
        return findConflicts(
            effective,
            overview.matches,
            overview.items,
            changeoverMinutesByRequest(overview),
        )
    }, [overview])
