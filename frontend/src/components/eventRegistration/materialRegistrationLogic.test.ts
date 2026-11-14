import {describe, expect, test} from 'vitest'
import {EventRegistrationCompetitionDto, MaterialRequestDto} from '@api/types.gen.ts'
import {
    activeMaterialOfferIds,
    closedOfferIdsOf,
    initialMaterialEntries,
    materialRequestUpdates,
    removedMaterialRequests,
    sameOfferIds,
} from './materialRegistrationLogic.ts'

const req = (overrides: Partial<MaterialRequestDto> = {}): MaterialRequestDto => ({
    id: 'r-1',
    competitionRegistration: 'team-1',
    materialOffer: 'offer-1',
    materialType: 'type-1',
    materialTypeName: 'C2x',
    category: 'BOAT',
    providerId: 'p-1',
    providerName: 'Bootshaus Nord',
    count: 1,
    status: 'CONFIRMED',
    requestedAt: '2026-11-01T10:00:00Z',
    ...overrides,
})

const competition = (id: string, name: string, closed = false) =>
    ({
        id,
        name,
        identifier: id,
        materialDemands: [
            {
                materialType: 'type-1',
                name: 'C2x',
                category: 'BOAT',
                count: 1,
                offers: [
                    {
                        offerId: `offer-${id}`,
                        providerId: 'p-1',
                        providerName: 'Bootshaus Nord',
                        capacity: 'GREEN',
                        requestsClosed: closed,
                    },
                ],
            },
        ],
    }) as unknown as EventRegistrationCompetitionDto

const info = {
    competitionsSingle: [competition('s1', 'Einer')],
    competitionsTeam: [competition('m2', 'M2')],
}
const teamLabel = (n: number) => `Team ${n}`

const team = (id: string, materialOfferIds: string[], locked = false) => ({
    id,
    locked,
    isLate: false,
    materialOfferIds,
})

describe('activeMaterialOfferIds / sameOfferIds', () => {
    test('nur aktive Anfragen zählen', () => {
        expect(
            activeMaterialOfferIds([
                req({materialOffer: 'a', status: 'REQUESTED'}),
                req({materialOffer: 'b', status: 'WAITLISTED'}),
                req({materialOffer: 'c', status: 'DECLINED'}),
                req({materialOffer: 'd', status: 'WITHDRAWN'}),
            ]),
        ).toEqual(['a', 'b'])
        expect(activeMaterialOfferIds(undefined)).toEqual([])
    })

    test('Reihenfolge egal, Länge nicht', () => {
        expect(sameOfferIds(['a', 'b'], ['b', 'a'])).toBe(true)
        expect(sameOfferIds(['a'], ['a', 'a'])).toBe(false)
        expect(sameOfferIds([], [])).toBe(true)
    })
})

describe('materialRequestUpdates', () => {
    test('nur geänderte, nicht gesperrte Meldungen, mit Teamname je Wettkampf', () => {
        const data = {
            participants: [
                {
                    id: 'p',
                    firstname: 'Anna',
                    lastname: 'Beispiel',
                    competitionsSingle: [
                        {
                            id: 'single-1',
                            competitionId: 's1',
                            locked: false,
                            isLate: false,
                            materialOfferIds: ['x'],
                        },
                    ],
                },
            ],
            competitionRegistrations: [
                {
                    competitionId: 'm2',
                    teams: [
                        team('t1', ['offer-m2']),
                        team('t2', ['offer-m2']),
                        team('t3', [], true),
                    ],
                },
            ],
        } as unknown as Parameters<typeof materialRequestUpdates>[0]
        const initial = new Map([
            ['t1', ['offer-m2']],
            ['t2', []],
        ])
        expect(materialRequestUpdates(data, initial, info, teamLabel)).toEqual([
            {
                registrationId: 't2',
                competitionName: 'm2 M2',
                entryLabel: 'Team 2',
                offerIds: ['offer-m2'],
            },
            {
                registrationId: 'single-1',
                competitionName: 's1 Einer',
                entryLabel: 'Anna Beispiel',
                offerIds: ['x'],
            },
        ])
    })
})

describe('removedMaterialRequests', () => {
    const upsertable = {
        participants: [],
        competitionRegistrations: [
            {
                competitionId: 'm2',
                teams: [
                    {
                        id: 't1',
                        materialRequests: [
                            req({competitionRegistration: 't1', materialOffer: 'offer-m2'}),
                        ],
                    },
                    {id: 't2', materialRequests: [req({status: 'DECLINED'})]},
                    {
                        id: 't3',
                        materialRequests: [req({status: 'REQUESTED', materialOffer: 'offer-zu'})],
                    },
                ],
            },
        ],
    } as unknown as Parameters<typeof initialMaterialEntries>[0]

    test('Ausgangsstand kennt nur Meldungen mit aktiver Anfrage', () => {
        expect(
            initialMaterialEntries(upsertable, info, teamLabel).map(e => e.registrationId),
        ).toEqual(['t1', 't3'])
    })

    test('entfernte Meldungen mit Anfrage; geschlossene Vergabe sperrt', () => {
        const initial = initialMaterialEntries(upsertable, info, teamLabel)
        const data = {
            participants: [],
            competitionRegistrations: [{competitionId: 'm2', teams: []}],
        } as unknown as Parameters<typeof removedMaterialRequests>[1]
        expect(removedMaterialRequests(initial, data, new Set(['offer-zu']))).toEqual([
            {
                registrationId: 't1',
                competitionName: 'm2 M2',
                entryLabel: 'Team 1',
                providerName: 'Bootshaus Nord',
                typeName: 'C2x',
                status: 'CONFIRMED',
                blocked: false,
            },
            {
                registrationId: 't3',
                competitionName: 'm2 M2',
                entryLabel: 'Team 3',
                providerName: 'Bootshaus Nord',
                typeName: 'C2x',
                status: 'REQUESTED',
                blocked: true,
            },
        ])
    })

    test('bleibt die Meldung im Formular, wird nichts zurückgezogen', () => {
        const initial = initialMaterialEntries(upsertable, info, teamLabel)
        const data = {
            participants: [],
            competitionRegistrations: [
                {competitionId: 'm2', teams: [team('t1', []), team('t3', [])]},
            ],
        } as unknown as Parameters<typeof removedMaterialRequests>[1]
        expect(removedMaterialRequests(initial, data, new Set())).toEqual([])
    })
})

describe('closedOfferIdsOf', () => {
    test('sammelt geschlossene Angebote aller Wettkämpfe', () => {
        const closed = {
            competitionsSingle: [],
            competitionsTeam: [competition('m2', 'M2', true), competition('m3', 'M3')],
        }
        expect([...closedOfferIdsOf(closed)]).toEqual(['offer-m2'])
    })
})
