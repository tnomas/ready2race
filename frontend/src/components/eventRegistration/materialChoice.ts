import {
    EventRegistrationMaterialDemandDto,
    EventRegistrationMaterialOfferDto,
    MaterialCategory,
    MaterialRequestDto,
    MaterialRequestStatus,
} from '../../api'

/**
 * Anfragen in diesen Zuständen bestehen noch: sie werden beim Absenden beibehalten, und eine
 * Vergabesperre blockiert nur neue Anfragen, nicht das Beibehalten.
 */
export const ACTIVE_REQUEST_STATUSES: readonly MaterialRequestStatus[] = [
    'REQUESTED',
    'CONFIRMED',
    'WAITLISTED',
]

export const activeRequestFor = (
    existing: readonly MaterialRequestDto[] | undefined,
    offerId: string,
): MaterialRequestDto | undefined =>
    existing?.find(r => r.materialOffer === offerId && ACTIVE_REQUEST_STATUSES.includes(r.status))

/**
 * Die zuletzt abgelehnte Anfrage für eines dieser Angebote – nur, wenn es keine aktive gibt. Der
 * Verein soll eine Ablehnung samt Notiz des Anbieters sehen, statt dass der Schalter kommentarlos
 * auf „aus" steht; die Auswahl bleibt trotzdem leer (abgelehnt ist nicht gebucht).
 */
export const declinedRequestFor = (
    existing: readonly MaterialRequestDto[] | undefined,
    offerIds: readonly string[],
): MaterialRequestDto | undefined => {
    const forOffers = (existing ?? []).filter(r => offerIds.includes(r.materialOffer))
    if (forOffers.some(r => ACTIVE_REQUEST_STATUSES.includes(r.status))) return undefined
    return forOffers
        .filter(r => r.status === 'DECLINED')
        .sort(
            (a, b) =>
                new Date(b.decidedAt ?? b.requestedAt).getTime() -
                new Date(a.decidedAt ?? a.requestedAt).getTime(),
        )[0]
}

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

/**
 * Was mit einer Materialzeile beim Absenden passiert: neu anfragen, bestehende Anfrage behalten,
 * bestehende Anfrage zurückziehen, oder nichts (eigenes Boot, keine Anfrage vorher).
 */
export type MaterialChange = 'new' | 'keep' | 'withdraw' | 'none'

export type MaterialSummaryLine = {
    materialType: string
    typeName: string
    category: MaterialCategory
    count: number
    /** Anbieter der gewählten Anfrage; bei „zurückziehen" der bisherige Anbieter. */
    providerName?: string
    change: MaterialChange
    /** Stand der bestehenden Anfrage (bei „behalten" und „zurückziehen"). */
    status?: MaterialRequestStatus
}

/**
 * Die Materialzeilen einer Meldung für die Prüfseite: je Bedarf, was gewählt ist und was das
 * Absenden daraus macht. Vergleichsbasis sind die bestehenden, noch aktiven Anfragen aus dem
 * Template der Meldung.
 */
export const materialSummaryLines = (
    demands: readonly EventRegistrationMaterialDemandDto[],
    selectedOfferIds: readonly string[],
    existing: readonly MaterialRequestDto[] | undefined,
): MaterialSummaryLine[] =>
    demands.map(demand => {
        const selected = demand.offers.find(o => selectedOfferIds.includes(o.offerId))
        const previous = demand.offers
            .map(o => activeRequestFor(existing, o.offerId))
            .find(r => r !== undefined)
        const base = {
            materialType: demand.materialType,
            typeName: demand.name,
            category: demand.category,
            count: demand.count,
        }
        if (selected) {
            const kept = previous?.materialOffer === selected.offerId
            return {
                ...base,
                providerName: selected.providerName,
                change: kept ? 'keep' : 'new',
                status: kept ? previous?.status : undefined,
            }
        }
        if (previous) {
            return {
                ...base,
                providerName: previous.providerName,
                change: 'withdraw',
                status: previous.status,
            }
        }
        return {...base, change: 'none'}
    })

/** Ob eine Meldung beim Absenden Materialanfragen ändert (neu oder zurückgezogen). */
export const changesMaterial = (lines: readonly MaterialSummaryLine[]): boolean =>
    lines.some(line => line.change === 'new' || line.change === 'withdraw')
