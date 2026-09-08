import {
    EventRegistrationMaterialDemandDto,
    EventRegistrationMaterialOfferDto,
    MaterialCategory,
} from '../../api'

/**
 * Eine Zeile im Material-Abschnitt des Anmeldeformulars: der Bedarf einer Materialart am
 * Wettkampf, dazu die Angebote der eingeladenen Anbieter und - falls die Meldung eins gewählt
 * hat - dessen ID. `selectedOfferId` ist null, wenn kein Angebot gewählt ist (eigenes
 * Material/Boot) oder wenn es zu dieser Materialart gar keins gibt.
 */
export type MaterialDemandChoice = {
    materialType: string
    typeName: string
    category: MaterialCategory
    count: number
    offers: EventRegistrationMaterialOfferDto[]
    selectedOfferId: string | null
}

/**
 * Baut aus dem Materialbedarf eines Wettkampfs und den aktuell gewählten Angebots-IDs einer
 * Meldung je Materialart eine Zeile. Eine ID, die zu keinem Angebot der jeweiligen Materialart
 * gehört (z.B. weil sie zu einer anderen Materialart gehört), wird ignoriert.
 */
export const buildChoices = (
    demands: EventRegistrationMaterialDemandDto[],
    selectedOfferIds: string[],
): MaterialDemandChoice[] =>
    demands.map(demand => ({
        materialType: demand.materialType,
        typeName: demand.name,
        category: demand.category,
        count: demand.count,
        offers: demand.offers,
        selectedOfferId:
            demand.offers.find(offer => selectedOfferIds.includes(offer.offerId))?.offerId ?? null,
    }))

/**
 * Die Liste der gewählten Angebots-IDs über alle Zeilen - ohne null. Das ist der Body des PUT
 * `setMaterialRequests`.
 */
export const selectedOfferIds = (choices: MaterialDemandChoice[]): string[] =>
    choices
        .map(choice => choice.selectedOfferId)
        .filter((offerId): offerId is string => offerId !== null)

/**
 * Wie eine Zeile zu beschriften ist: 'noOffer', wenn es zu der Materialart keine Angebote gibt
 * (die Meldung bringt zwangsläufig eigenes Material/Boot mit), sonst 'own' ohne gewähltes Angebot
 * oder 'rent' mit gewähltem Angebot.
 */
export const choiceKind = (choice: MaterialDemandChoice): 'own' | 'rent' | 'noOffer' => {
    if (choice.offers.length === 0) return 'noOffer'
    return choice.selectedOfferId === null ? 'own' : 'rent'
}
