import {MaterialOverviewMatchDto, MaterialOverviewRequestDto} from '@api/types.gen.ts'

/**
 * Wirksames Stück je Anfrage und Lauf: eine Ausnahme für genau diesen Lauf schlägt die
 * Grundzuteilung (competitionMatch == null). Ohne jede passende Zuteilung entsteht für den
 * Lauf gar kein Eintrag - "kein Stück zugeteilt" ist kein Konfliktfall.
 */
export type EffectiveAssignment = {
    requestId: string
    matchId: string
    itemIds: string[]
    isException: boolean
}

/**
 * Für jede Anfrage und jeden Lauf, an dem ihre Meldung teilnimmt (Lauf.registrationIds
 * enthält competitionRegistration): eine Ausnahme für diesen Lauf schlägt die Grundzuteilung.
 */
export const effectiveAssignments = (
    requests: MaterialOverviewRequestDto[],
    matches: MaterialOverviewMatchDto[],
): EffectiveAssignment[] => {
    const result: EffectiveAssignment[] = []

    for (const request of requests) {
        const baseItemIds = request.assignments
            .filter(a => a.competitionMatch == null)
            .map(a => a.materialItem)

        for (const match of matches) {
            if (!match.registrationIds.includes(request.competitionRegistration)) {
                continue
            }

            const exceptionItemIds = request.assignments
                .filter(a => a.competitionMatch === match.id)
                .map(a => a.materialItem)

            const isException = exceptionItemIds.length > 0
            const itemIds = isException ? exceptionItemIds : baseItemIds

            if (itemIds.length === 0) {
                continue
            }

            result.push({requestId: request.id, matchId: match.id, itemIds, isException})
        }
    }

    return result
}
