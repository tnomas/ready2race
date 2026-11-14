import {MaterialOverviewItemDto, MaterialOverviewRequestDto} from '@api/types.gen.ts'

export type ProposedAssignment = {
    requestId: string
    entries: {materialItem: string; competitionMatch: null}[]
}

/**
 * Die Startnummer, gegen die Bootsnummern verglichen werden: die im Lauf (`startNumber`, vom
 * Backend aus dem ersten Lauf der Meldung), solange es keinen Lauf gibt die Meldungsnummer
 * (`teamNumber`). Eine Stelle für alle Anzeigen und Regeln des Anbieter-Dashboards.
 */
export const startNumberOf = (
    request: Pick<MaterialOverviewRequestDto, 'startNumber' | 'teamNumber'>,
): number | undefined => request.startNumber ?? request.teamNumber

const hasBaseAssignment = (request: MaterialOverviewRequestDto): boolean =>
    request.assignments.some(a => a.competitionMatch == null)

/**
 * Schlägt für bestätigte Anfragen ohne Grundzuteilung das aktive Stück vor, dessen Nummer der
 * Startnummer des Teams entspricht. Ein Stück darf für mehrere Anfragen vorgeschlagen werden -
 * dieselbe Nummer taucht bei unterschiedlichen Wettkämpfen bewusst mehrfach auf, das ist kein
 * Konflikt zwischen Anfragen dieser Funktion.
 */
export const assignByStartNumber = (
    requests: MaterialOverviewRequestDto[],
    items: MaterialOverviewItemDto[],
): ProposedAssignment[] => {
    const result: ProposedAssignment[] = []

    for (const request of requests) {
        if (request.status !== 'CONFIRMED') {
            continue
        }
        if (hasBaseAssignment(request)) {
            continue
        }
        if (startNumberOf(request) == null) {
            continue
        }

        const candidate = items.find(
            item =>
                item.status === 'ACTIVE' &&
                item.materialType === request.materialType &&
                item.number === startNumberOf(request),
        )

        if (candidate != null) {
            result.push({
                requestId: request.id,
                entries: [{materialItem: candidate.id, competitionMatch: null}],
            })
        }
    }

    return result
}

/**
 * Eine Anfrage weicht von der Startnummer ab, wenn sie eine Grundzuteilung hat, aber keines
 * ihrer Stücke die Nummer des Teams trägt. Ohne Grundzuteilung gibt es nichts, wovon
 * abzuweichen wäre.
 */
export const deviatesFromStartNumber = (
    request: MaterialOverviewRequestDto,
    items: MaterialOverviewItemDto[],
): boolean => {
    const baseItemIds = request.assignments
        .filter(a => a.competitionMatch == null)
        .map(a => a.materialItem)
    if (baseItemIds.length === 0) {
        return false
    }

    const itemsById = new Map(items.map(i => [i.id, i]))
    return !baseItemIds.some(id => itemsById.get(id)?.number === startNumberOf(request))
}
