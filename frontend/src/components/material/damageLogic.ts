import {
    MaterialDamageStatus,
    MaterialOverviewDto,
    MaterialOverviewRequestDto,
} from '@api/types.gen.ts'
import {effectiveAssignments} from './effectiveAssignments.ts'
import {windowOf} from './conflicts.ts'

/**
 * Regeln des Schadensdialogs: wer als Verursacher in Frage kommt, wer vorgeschlagen wird und wann
 * nach dem Speichern die Ersatzwahl für betroffene Läufe folgt.
 */

/** Je Meldung eine Auswahl – bestätigte Anfragen, die erste je Meldung. */
export const causerCandidates = (
    requests: readonly MaterialOverviewRequestDto[],
): MaterialOverviewRequestDto[] => {
    const byRegistration = new Map<string, MaterialOverviewRequestDto>()
    for (const request of requests) {
        if (
            request.status === 'CONFIRMED' &&
            !byRegistration.has(request.competitionRegistration)
        ) {
            byRegistration.set(request.competitionRegistration, request)
        }
    }
    return [...byRegistration.values()]
}

/**
 * Vorschlag für den Verursacher: die Anfrage, in deren Lauf das Stück zum Meldezeitpunkt wirksam
 * zugeteilt war (Ausnahme vor Grundzuteilung). Ohne passenden Lauf kein Vorschlag – lieber leer
 * als ein falscher Verein.
 */
export const suggestCauser = (
    overview: Pick<MaterialOverviewDto, 'requests' | 'matches'>,
    itemId: string,
    time: number,
): MaterialOverviewRequestDto | null => {
    if (Number.isNaN(time)) return null
    const matchesById = new Map(overview.matches.map(m => [m.id, m]))
    for (const entry of effectiveAssignments(overview.requests, overview.matches)) {
        if (!entry.itemIds.includes(itemId)) continue
        const match = matchesById.get(entry.matchId)
        const window = match ? windowOf(match) : null
        if (window != null && window.start <= time && time <= window.end) {
            return overview.requests.find(r => r.id === entry.requestId) ?? null
        }
    }
    return null
}

/**
 * Nach dem Speichern die Ersatzwahl öffnen? Nur bei einem offenen Schaden mit „Ausfall ab": Die
 * Übersicht kennt Ausfälle nur für gemeldete Schäden; ein reparierter Schaden schlüge sonst Ersatz
 * für Läufe vor, die längst wieder ihr Boot haben, und „Übernehmen" legte unnötige Ausnahmen an.
 */
export const needsOutageImpact = (info: {
    status: MaterialDamageStatus
    outOfServiceFrom?: string
}): boolean => info.status === 'REPORTED' && info.outOfServiceFrom != null

/**
 * Folgt „Ausfall bis“ dem Feld „Repariert am“? Ja, solange es leer ist oder genau dem
 * Reparaturzeitpunkt entspricht - so hat der Server es beim Speichern gesetzt (das Ausfallfenster
 * endet mit der Reparatur). Hat jemand ein anderes Ende eingetragen, bleibt es stehen.
 */
export const outageUntilFollowsRepair = (
    outOfServiceUntil: string | undefined,
    repairedAt: string | undefined,
): boolean => !outOfServiceUntil || outOfServiceUntil === repairedAt
