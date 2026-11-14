import {describe, expect, test} from 'vitest'
import {MaterialAssignmentDto, MaterialOverviewMatchDto, MaterialOverviewRequestDto} from '@api/types.gen.ts'
import {effectiveAssignments} from './effectiveAssignments.ts'

/**
 * Baut eine Testanfrage mit sinnvollen Standardwerten, damit jeder Fall nur die Felder
 * nennen muss, auf die es ankommt.
 */
const request = (overrides: Partial<MaterialOverviewRequestDto> = {}): MaterialOverviewRequestDto => ({
    id: 'req-1',
    materialOffer: 'offer-1',
    materialType: 'type-1',
    materialTypeName: 'Zweier',
    category: 'BOAT',
    count: 1,
    status: 'CONFIRMED',
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

const match = (overrides: Partial<MaterialOverviewMatchDto> = {}): MaterialOverviewMatchDto => ({
    id: 'match-1',
    competition: 'comp-1',
    registrationIds: ['reg-1'],
    teams: [],
    ...overrides,
})

const assignment = (overrides: Partial<MaterialAssignmentDto> = {}): MaterialAssignmentDto => ({
    id: 'assign-1',
    materialItem: 'item-1',
    ...overrides,
})

describe('effectiveAssignments', () => {
    test('eine Ausnahme für den Lauf schlägt die Grundzuteilung', () => {
        const req = request({
            assignments: [
                assignment({id: 'a1', materialItem: 'item-basis', competitionMatch: undefined}),
                assignment({id: 'a2', materialItem: 'item-ausnahme', competitionMatch: 'match-1'}),
            ],
        })
        const result = effectiveAssignments([req], [match()])
        expect(result).toEqual([
            {requestId: 'req-1', matchId: 'match-1', itemIds: ['item-ausnahme'], isException: true},
        ])
    })

    test('ohne Ausnahme gilt die Grundzuteilung für den Lauf', () => {
        const req = request({
            assignments: [assignment({id: 'a1', materialItem: 'item-basis', competitionMatch: undefined})],
        })
        const result = effectiveAssignments([req], [match()])
        expect(result).toEqual([
            {requestId: 'req-1', matchId: 'match-1', itemIds: ['item-basis'], isException: false},
        ])
    })

    test('ein Lauf ohne die Meldung der Anfrage wird ignoriert', () => {
        const req = request({
            competitionRegistration: 'reg-andere',
            assignments: [assignment({id: 'a1', materialItem: 'item-basis', competitionMatch: undefined})],
        })
        const result = effectiveAssignments([req], [match()])
        expect(result).toEqual([])
    })

    test('ohne jede Zuteilung entsteht für den Lauf kein Eintrag', () => {
        const req = request({assignments: []})
        const result = effectiveAssignments([req], [match()])
        expect(result).toEqual([])
    })

    test('mehrere Läufe erhalten je einen eigenen Eintrag', () => {
        const req = request({
            assignments: [assignment({id: 'a1', materialItem: 'item-basis', competitionMatch: undefined})],
        })
        const matches = [
            match({id: 'match-1', registrationIds: ['reg-1']}),
            match({id: 'match-2', registrationIds: ['reg-1']}),
        ]
        const result = effectiveAssignments([req], matches)
        expect(result).toEqual([
            {requestId: 'req-1', matchId: 'match-1', itemIds: ['item-basis'], isException: false},
            {requestId: 'req-1', matchId: 'match-2', itemIds: ['item-basis'], isException: false},
        ])
    })
})
