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

export type CapacityOverrun = {
    offerId: string
    materialTypeName: string
    plannedCount: number
    /** Bestätigte Menge, wenn die gewählten Anfragen dazukommen. */
    confirmedAfter: number
}

/**
 * Würde die Sammelbestätigung die geplante Anzahl eines Angebots überschreiten? Je Angebot die
 * bestätigte Menge plus die Mengen der gewählten Anfragen gegen `plannedCount`. Bestätigen über
 * den Plan bleibt erlaubt (der Anbieter kennt seinen Bestand), aber nicht still: Die Oberfläche
 * nennt die Zahl vorher.
 */
export const capacityOverruns = (
    offers: readonly MaterialOfferDto[],
    requests: readonly MaterialOverviewRequestDto[],
    selectedIds: readonly string[],
): CapacityOverrun[] => {
    const selected = new Set(selectedIds)
    return offers
        .map(offer => {
            const forOffer = requests.filter(r => r.materialOffer === offer.id)
            const confirmedAfter = forOffer
                .filter(r => r.status === 'CONFIRMED' || selected.has(r.id))
                .reduce((sum, r) => sum + r.count, 0)
            const adds = forOffer.some(r => selected.has(r.id) && r.status !== 'CONFIRMED')
            const overrun: CapacityOverrun = {
                offerId: offer.id,
                materialTypeName: offer.materialTypeName,
                plannedCount: offer.plannedCount,
                confirmedAfter,
            }
            return adds && confirmedAfter > offer.plannedCount ? overrun : null
        })
        .filter((o): o is CapacityOverrun => o != null)
}
