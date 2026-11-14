import {
    MaterialDamageDto,
    MaterialOverviewItemDto,
    MaterialOverviewRequestDto,
    MaterialRequestStatus,
} from '@api/types.gen.ts'
import {deviatesFromTeamNumber, teamNumberOf} from './materialNumbers.ts'
import {MaterialConflict} from './conflicts.ts'

/**
 * Reine Regeln des Anbieter-Arbeitsplatzes (Dashboard am Steg): was zuerst steht, welche Aktion
 * je Zeile die Primäraktion ist, was in das ⋮-Menü wandert und was die Zähler zählen. Die Panels
 * unter `components/material/` entscheiden nichts davon selbst.
 */

// ---------------------------------------------------------------------------------------------
// Anfragen

/**
 * Filter der Anfragenliste. „Offen" heißt: noch nicht endgültig vergeben – angefragt oder auf
 * der Warteliste. Das ist die Arbeit, die der Anbieter am Steg erledigen muss; deshalb ist
 * „Offen" vorbelegt.
 */
export type RequestFilter = 'OPEN' | 'CONFIRMED' | 'DECLINED' | 'WITHDRAWN' | 'ALL'
export const REQUEST_FILTERS: readonly RequestFilter[] = [
    'OPEN',
    'CONFIRMED',
    'DECLINED',
    'WITHDRAWN',
    'ALL',
]
export const DEFAULT_REQUEST_FILTER: RequestFilter = 'OPEN'

export const isOpenRequestStatus = (status: MaterialRequestStatus): boolean =>
    status === 'REQUESTED' || status === 'WAITLISTED'

export const matchesRequestFilter = (
    status: MaterialRequestStatus,
    filter: RequestFilter,
): boolean => {
    switch (filter) {
        case 'OPEN':
            return isOpenRequestStatus(status)
        case 'ALL':
            return true
        default:
            return status === filter
    }
}

export const requestFilterCounts = (
    requests: readonly Pick<MaterialOverviewRequestDto, 'status'>[],
): Record<RequestFilter, number> => {
    const counts: Record<RequestFilter, number> = {
        OPEN: 0,
        CONFIRMED: 0,
        DECLINED: 0,
        WITHDRAWN: 0,
        ALL: 0,
    }
    for (const request of requests) {
        for (const filter of REQUEST_FILTERS) {
            if (matchesRequestFilter(request.status, filter)) counts[filter]++
        }
    }
    return counts
}

const STATUS_WORK_ORDER: Record<MaterialRequestStatus, number> = {
    REQUESTED: 0,
    WAITLISTED: 1,
    CONFIRMED: 2,
    DECLINED: 3,
    WITHDRAWN: 4,
}

/**
 * Reihenfolge der Liste: zuerst, was eine Entscheidung braucht (angefragt, dann Warteliste),
 * danach Erledigtes; innerhalb gleicher Status die ältere Anfrage zuerst (wer zuerst fragt,
 * kommt zuerst dran).
 */
export const sortRequestsForWork = <
    T extends Pick<MaterialOverviewRequestDto, 'status' | 'requestedAt'>,
>(
    requests: readonly T[],
): T[] =>
    [...requests].sort(
        (a, b) =>
            STATUS_WORK_ORDER[a.status] - STATUS_WORK_ORDER[b.status] ||
            new Date(a.requestedAt).getTime() - new Date(b.requestedAt).getTime(),
    )

export type RequestDecision = 'CONFIRMED' | 'WAITLISTED' | 'DECLINED'

export type RequestActionPlan = {
    /** Die eine sichtbare Aktion der Zeile; fehlt, wenn nichts mehr zu entscheiden ist. */
    primary?: RequestDecision
    /** Seltenes im flachen ⋮-Menü, in dieser Reihenfolge. */
    more: RequestDecision[]
}

/**
 * Je Status eine Primäraktion und ein flaches Menü. Bestätigen ist der Regelfall und bleibt mit
 * einem Tipp erreichbar; Warteliste und Ablehnen brauchen ohnehin eine Notiz (Dialog) und liegen
 * im ⋮-Menü. Zurückgezogene Anfragen hat der Verein beendet – dort gibt es nichts zu tun.
 */
export const requestActionPlan = (status: MaterialRequestStatus): RequestActionPlan => {
    switch (status) {
        case 'REQUESTED':
            return {primary: 'CONFIRMED', more: ['WAITLISTED', 'DECLINED']}
        case 'WAITLISTED':
            return {primary: 'CONFIRMED', more: ['DECLINED']}
        case 'CONFIRMED':
            return {more: ['WAITLISTED', 'DECLINED']}
        case 'DECLINED':
            return {more: ['CONFIRMED', 'WAITLISTED']}
        case 'WITHDRAWN':
            return {more: []}
    }
}

// ---------------------------------------------------------------------------------------------
// Zuteilung

export type AssignmentState = 'unassigned' | 'deviates' | 'assigned'

export const baseItemIdsOf = (request: Pick<MaterialOverviewRequestDto, 'assignments'>): string[] =>
    request.assignments.filter(a => a.competitionMatch == null).map(a => a.materialItem)

export const exceptionCountOf = (
    request: Pick<MaterialOverviewRequestDto, 'assignments'>,
): number => request.assignments.filter(a => a.competitionMatch != null).length

/**
 * Stand einer bestätigten Anfrage: noch kein Stück (Arbeit), Grundzuteilung mit anderer Nummer als
 * die Meldungsnummer (zu beachten, aber zulässig) oder zugeteilt (Regelfall). Abweichungen von der
 * Startnummer einzelner Läufe zählt `deviatingMatchCount`.
 */
export const assignmentState = (
    request: MaterialOverviewRequestDto,
    items: MaterialOverviewItemDto[],
): AssignmentState => {
    if (baseItemIdsOf(request).length === 0) return 'unassigned'
    return deviatesFromTeamNumber(request, items) ? 'deviates' : 'assigned'
}

const conflictCountOf = (requestId: string, conflicts: readonly MaterialConflict[]) =>
    conflicts.filter(c => c.requestIds.includes(requestId)).length

/**
 * Die Zeilen der Einteilung nach Team: nur bestätigte Anfragen; zuerst ohne Stück, dann mit
 * Konflikt, dann der Rest; innerhalb nach Wettkampfkennung und Meldungsnummer.
 */
export const assignmentRowsForWork = (
    requests: readonly MaterialOverviewRequestDto[],
    conflicts: readonly MaterialConflict[],
): MaterialOverviewRequestDto[] => {
    const rank = (r: MaterialOverviewRequestDto) =>
        baseItemIdsOf(r).length === 0 ? 0 : conflictCountOf(r.id, conflicts) > 0 ? 1 : 2
    return requests
        .filter(r => r.status === 'CONFIRMED')
        .sort(
            (a, b) =>
                rank(a) - rank(b) ||
                a.competitionIdentifier.localeCompare(b.competitionIdentifier, undefined, {
                    numeric: true,
                }) ||
                (teamNumberOf(a) ?? Number.MAX_SAFE_INTEGER) -
                    (teamNumberOf(b) ?? Number.MAX_SAFE_INTEGER),
        )
}

export type AssignmentWork = {
    /** Bestätigte Anfragen ohne Grundzuteilung. */
    unassigned: number
    /** Bestätigte Anfragen mit mindestens einem Konflikt. */
    withConflicts: number
}

export const assignmentWork = (
    requests: readonly MaterialOverviewRequestDto[],
    conflicts: readonly MaterialConflict[],
): AssignmentWork => {
    const confirmed = requests.filter(r => r.status === 'CONFIRMED')
    return {
        unassigned: confirmed.filter(r => baseItemIdsOf(r).length === 0).length,
        withConflicts: confirmed.filter(r => conflictCountOf(r.id, conflicts) > 0).length,
    }
}

/** „Boot 7 #7" bzw. „Boot 7", wenn das Stück keine Nummer trägt. */
export const itemLabel = (item: {label: string; number?: number | null}): string =>
    item.number != null ? `${item.label} #${item.number}` : item.label

// ---------------------------------------------------------------------------------------------
// Schäden

/** Offen = gemeldet und noch nicht repariert; vorbelegt, weil das die Arbeit ist. */
export type DamageFilter = 'OPEN' | 'REPAIRED' | 'ALL'
export const DAMAGE_FILTERS: readonly DamageFilter[] = ['OPEN', 'REPAIRED', 'ALL']
export const DEFAULT_DAMAGE_FILTER: DamageFilter = 'OPEN'

export const matchesDamageFilter = (
    damage: Pick<MaterialDamageDto, 'status'>,
    filter: DamageFilter,
): boolean =>
    filter === 'ALL' ||
    (filter === 'OPEN' ? damage.status === 'REPORTED' : damage.status === 'REPAIRED')

export const damageFilterCounts = (
    damages: readonly Pick<MaterialDamageDto, 'status'>[],
): Record<DamageFilter, number> => ({
    OPEN: damages.filter(d => matchesDamageFilter(d, 'OPEN')).length,
    REPAIRED: damages.filter(d => matchesDamageFilter(d, 'REPAIRED')).length,
    ALL: damages.length,
})

/** Neueste Meldung zuerst. */
export const sortDamagesForWork = <T extends Pick<MaterialDamageDto, 'reportedAt'>>(
    damages: readonly T[],
): T[] =>
    [...damages].sort((a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime())
