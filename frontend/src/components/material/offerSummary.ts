import {MaterialOfferDto, MaterialOverviewRequestDto} from '@api/types.gen.ts'

export type OfferSummary = {
    offerId: string
    materialTypeName: string
    plannedCount: number
    confirmedCount: number
    requestedCount: number
    waitlistedCount: number
    /** Älteste Anfrage auf der Warteliste, solange die bestätigte Menge die geplante Anzahl
     * unterschreitet - sie wäre als nächste an der Reihe. Sonst null. */
    highlightRequestId: string | null
}

/**
 * Je Angebot die Summen aus `count` (bestätigt/offen/Warteliste) gegen die geplante Anzahl,
 * plus die älteste Warteliste-Anfrage zum Hervorheben. DECLINED und WITHDRAWN zählen nirgends
 * mit - sie sind erledigt bzw. betreffen das Angebot nicht mehr.
 */
export const offerSummaries = (
    offers: MaterialOfferDto[],
    requests: MaterialOverviewRequestDto[],
): OfferSummary[] =>
    offers.map(offer => {
        const forOffer = requests.filter(request => request.materialOffer === offer.id)

        const sumOf = (status: MaterialOverviewRequestDto['status']) =>
            forOffer
                .filter(request => request.status === status)
                .reduce((sum, request) => sum + request.count, 0)

        const confirmedCount = sumOf('CONFIRMED')
        const requestedCount = sumOf('REQUESTED')
        const waitlistedCount = sumOf('WAITLISTED')

        const oldestWaitlisted = forOffer
            .filter(request => request.status === 'WAITLISTED')
            .sort(
                (a, b) => new Date(a.requestedAt).getTime() - new Date(b.requestedAt).getTime(),
            )[0]

        const highlightRequestId =
            confirmedCount < offer.plannedCount && oldestWaitlisted != null
                ? oldestWaitlisted.id
                : null

        return {
            offerId: offer.id,
            materialTypeName: offer.materialTypeName,
            plannedCount: offer.plannedCount,
            confirmedCount,
            requestedCount,
            waitlistedCount,
            highlightRequestId,
        }
    })
