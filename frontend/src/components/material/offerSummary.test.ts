import {describe, expect, test} from 'vitest'
import {MaterialOfferDto, MaterialOverviewRequestDto} from '@api/types.gen.ts'
import {offerSummaries} from './offerSummary.ts'

const offer = (overrides: Partial<MaterialOfferDto> = {}): MaterialOfferDto => ({
    id: 'offer-1',
    event: 'event-1',
    materialProvider: 'provider-1',
    materialType: 'type-1',
    materialTypeName: 'Zweier',
    category: 'BOAT',
    plannedCount: 2,
    changeoverMinutes: 10,
    ...overrides,
})

const request = (
    overrides: Partial<MaterialOverviewRequestDto> = {},
): MaterialOverviewRequestDto => ({
    id: 'req-1',
    materialOffer: 'offer-1',
    materialType: 'type-1',
    materialTypeName: 'Zweier',
    category: 'BOAT',
    count: 1,
    status: 'REQUESTED',
    requestedAt: '2026-09-07T08:00:00Z',
    competitionRegistration: 'reg-1',
    competition: 'comp-1',
    competitionIdentifier: '1',
    competitionName: 'Wettkampf 1',
    clubId: 'club-1',
    clubName: 'Verein 1',
    assignments: [],
    ...overrides,
})

describe('offerSummaries', () => {
    test('summiert count je Status getrennt nach Angebot', () => {
        const offers = [offer()]
        const requests = [
            request({id: 'r1', status: 'CONFIRMED', count: 2}),
            request({id: 'r2', status: 'REQUESTED', count: 1}),
            request({id: 'r3', status: 'WAITLISTED', count: 3}),
            request({id: 'r4', status: 'DECLINED', count: 5}),
            request({id: 'r5', status: 'WITHDRAWN', count: 5}),
        ]

        const [summary] = offerSummaries(offers, requests)

        expect(summary.confirmedCount).toBe(2)
        expect(summary.requestedCount).toBe(1)
        expect(summary.waitlistedCount).toBe(3)
        expect(summary.plannedCount).toBe(2)
        expect(summary.materialTypeName).toBe('Zweier')
    })

    test('zählt nur Anfragen des jeweils eigenen Angebots', () => {
        const offers = [offer({id: 'offer-1'}), offer({id: 'offer-2', materialTypeName: 'Einer'})]
        const requests = [
            request({id: 'r1', materialOffer: 'offer-1', status: 'CONFIRMED', count: 1}),
            request({id: 'r2', materialOffer: 'offer-2', status: 'CONFIRMED', count: 4}),
        ]

        const summaries = offerSummaries(offers, requests)

        expect(summaries.find(s => s.offerId === 'offer-1')?.confirmedCount).toBe(1)
        expect(summaries.find(s => s.offerId === 'offer-2')?.confirmedCount).toBe(4)
    })

    test('hebt die älteste Warteliste-Anfrage hervor, solange bestätigt < geplant', () => {
        const offers = [offer({plannedCount: 2})]
        const requests = [
            request({id: 'r1', status: 'CONFIRMED', count: 1}),
            request({
                id: 'r-alt',
                status: 'WAITLISTED',
                count: 1,
                requestedAt: '2026-09-01T08:00:00Z',
            }),
            request({
                id: 'r-neu',
                status: 'WAITLISTED',
                count: 1,
                requestedAt: '2026-09-05T08:00:00Z',
            }),
        ]

        const [summary] = offerSummaries(offers, requests)

        expect(summary.highlightRequestId).toBe('r-alt')
    })

    test('hebt niemanden hervor, wenn die bestätigte Menge die geplante Anzahl erreicht', () => {
        const offers = [offer({plannedCount: 1})]
        const requests = [
            request({id: 'r1', status: 'CONFIRMED', count: 1}),
            request({
                id: 'r2',
                status: 'WAITLISTED',
                count: 1,
                requestedAt: '2026-09-01T08:00:00Z',
            }),
        ]

        const [summary] = offerSummaries(offers, requests)

        expect(summary.highlightRequestId).toBeNull()
    })

    test('hebt niemanden hervor, wenn es keine Warteliste-Anfrage gibt', () => {
        const offers = [offer({plannedCount: 5})]
        const requests = [request({id: 'r1', status: 'CONFIRMED', count: 1})]

        const [summary] = offerSummaries(offers, requests)

        expect(summary.highlightRequestId).toBeNull()
    })
})
