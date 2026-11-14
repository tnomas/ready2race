import {describe, expect, test} from 'vitest'
import {
    buildChoices,
    changesMaterial,
    choiceKind,
    materialSummaryLines,
    selectedOfferIds,
} from './materialChoice.ts'
import {EventRegistrationMaterialDemandDto, MaterialRequestDto} from '../../api'

const demand = (
    overrides: Partial<EventRegistrationMaterialDemandDto> = {},
): EventRegistrationMaterialDemandDto => ({
    materialType: 't1',
    name: 'C4x+',
    category: 'BOAT',
    count: 1,
    offers: [
        {
            offerId: 'o1',
            providerId: 'p',
            providerName: 'Nord',
            priceText: '45 €',
            capacity: 'GREEN',
            requestsClosed: false,
        },
    ],
    ...overrides,
})

describe('buildChoices', () => {
    test('markiert das gewählte Angebot je Materialart', () => {
        const demands = [demand()]
        expect(buildChoices(demands, ['o1'])[0].selectedOfferId).toBe('o1')
        expect(buildChoices(demands, [])[0].selectedOfferId).toBeNull()
    })

    test('ohne Angebot heißt die Zeile noOffer', () => {
        expect(
            choiceKind({
                materialType: 't',
                typeName: 'x',
                category: 'OTHER',
                count: 1,
                offers: [],
                selectedOfferId: null,
            }),
        ).toBe('noOffer')
    })

    test('übernimmt Namen, Kategorie und Anzahl unverändert aus dem Bedarf', () => {
        const demands = [demand({materialType: 't2', name: 'Steg', category: 'OTHER', count: 3})]
        const choice = buildChoices(demands, [])[0]
        expect(choice.materialType).toBe('t2')
        expect(choice.typeName).toBe('Steg')
        expect(choice.category).toBe('OTHER')
        expect(choice.count).toBe(3)
        expect(choice.offers).toEqual(demands[0].offers)
    })

    test('ignoriert Angebots-IDs anderer Materialarten', () => {
        const demands = [demand()]
        expect(buildChoices(demands, ['irgendeine-andere-id'])[0].selectedOfferId).toBeNull()
    })

    test('wählt bei mehreren Angeboten genau das passende', () => {
        const demands = [
            demand({
                offers: [
                    {
                        offerId: 'o1',
                        providerId: 'p1',
                        providerName: 'Nord',
                        capacity: 'GREEN',
                        requestsClosed: false,
                    },
                    {
                        offerId: 'o2',
                        providerId: 'p2',
                        providerName: 'Süd',
                        capacity: 'YELLOW',
                        requestsClosed: false,
                    },
                ],
            }),
        ]
        expect(buildChoices(demands, ['o2'])[0].selectedOfferId).toBe('o2')
    })

    test('baut für jede Materialart eine eigene Zeile', () => {
        const demands = [
            demand({materialType: 't1'}),
            demand({materialType: 't2', name: 'Steg', category: 'OTHER'}),
        ]
        expect(buildChoices(demands, []).map(c => c.materialType)).toEqual(['t1', 't2'])
    })
})

describe('selectedOfferIds', () => {
    test('liefert nur die tatsächlich gewählten Angebots-IDs, ohne null', () => {
        const choices = [
            {
                materialType: 't1',
                typeName: 'a',
                category: 'BOAT' as const,
                count: 1,
                offers: [],
                selectedOfferId: 'o1',
            },
            {
                materialType: 't2',
                typeName: 'b',
                category: 'OTHER' as const,
                count: 1,
                offers: [],
                selectedOfferId: null,
            },
            {
                materialType: 't3',
                typeName: 'c',
                category: 'OTHER' as const,
                count: 1,
                offers: [],
                selectedOfferId: 'o3',
            },
        ]
        expect(selectedOfferIds(choices)).toEqual(['o1', 'o3'])
    })

    test('ist leer, wenn nirgends etwas gewählt wurde', () => {
        const choices = [
            {
                materialType: 't1',
                typeName: 'a',
                category: 'BOAT' as const,
                count: 1,
                offers: [],
                selectedOfferId: null,
            },
        ]
        expect(selectedOfferIds(choices)).toEqual([])
    })
})

describe('choiceKind', () => {
    test('own, wenn ein Angebot besteht aber keins gewählt ist', () => {
        expect(
            choiceKind({
                materialType: 't',
                typeName: 'x',
                category: 'BOAT',
                count: 1,
                offers: [demand().offers[0]],
                selectedOfferId: null,
            }),
        ).toBe('own')
    })

    test('rent, wenn ein Angebot gewählt ist', () => {
        expect(
            choiceKind({
                materialType: 't',
                typeName: 'x',
                category: 'BOAT',
                count: 1,
                offers: [demand().offers[0]],
                selectedOfferId: 'o1',
            }),
        ).toBe('rent')
    })
})

const existingRequest = (overrides: Partial<MaterialRequestDto> = {}): MaterialRequestDto => ({
    id: 'r1',
    competitionRegistration: 'cr1',
    materialOffer: 'o1',
    materialType: 't1',
    materialTypeName: 'C4x+',
    category: 'BOAT',
    providerId: 'p',
    providerName: 'Nord',
    count: 1,
    status: 'CONFIRMED',
    requestedAt: '2026-09-01T10:00:00Z',
    ...overrides,
})

describe('materialSummaryLines', () => {
    test('neue Wahl ohne bestehende Anfrage ist „neu"', () => {
        const [line] = materialSummaryLines([demand()], ['o1'], [])
        expect(line).toMatchObject({change: 'new', providerName: 'Nord', typeName: 'C4x+'})
        expect(changesMaterial([line])).toBe(true)
    })

    test('unveränderte Wahl behält die Anfrage samt Status', () => {
        const [line] = materialSummaryLines([demand()], ['o1'], [existingRequest()])
        expect(line).toMatchObject({change: 'keep', status: 'CONFIRMED'})
        expect(changesMaterial([line])).toBe(false)
    })

    test('abgewählte aktive Anfrage wird zurückgezogen', () => {
        const [line] = materialSummaryLines(
            [demand()],
            [],
            [existingRequest({status: 'WAITLISTED'})],
        )
        expect(line).toMatchObject({change: 'withdraw', status: 'WAITLISTED', providerName: 'Nord'})
    })

    test('erledigte Anfragen zählen nicht als bestehend', () => {
        const [line] = materialSummaryLines([demand()], [], [existingRequest({status: 'DECLINED'})])
        expect(line.change).toBe('none')
        const [again] = materialSummaryLines(
            [demand()],
            ['o1'],
            [existingRequest({status: 'WITHDRAWN'})],
        )
        expect(again.change).toBe('new')
    })

    test('Wechsel des Anbieters ist eine neue Anfrage', () => {
        const twoOffers = demand({
            offers: [
                ...demand().offers,
                {
                    offerId: 'o2',
                    providerId: 'p2',
                    providerName: 'Süd',
                    capacity: 'YELLOW',
                    requestsClosed: false,
                },
            ],
        })
        const [line] = materialSummaryLines([twoOffers], ['o2'], [existingRequest()])
        expect(line).toMatchObject({change: 'new', providerName: 'Süd'})
    })
})
