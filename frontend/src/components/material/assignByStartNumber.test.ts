import {describe, expect, test} from 'vitest'
import {MaterialAssignmentDto, MaterialOverviewItemDto, MaterialOverviewRequestDto} from '@api/types.gen.ts'
import {assignByStartNumber, deviatesFromStartNumber, startNumberOf} from './assignByStartNumber.ts'

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
    teamNumber: 7,
    clubId: 'club-1',
    clubName: 'Verein 1',
    assignments: [],
    ...overrides,
})

const item = (overrides: Partial<MaterialOverviewItemDto> = {}): MaterialOverviewItemDto => ({
    id: 'item-1',
    materialType: 'type-1',
    materialTypeName: 'Zweier',
    category: 'BOAT',
    number: 7,
    label: 'Boot 7',
    status: 'ACTIVE',
    outages: [],
    ...overrides,
})

const assignment = (overrides: Partial<MaterialAssignmentDto> = {}): MaterialAssignmentDto => ({
    id: 'assign-1',
    materialItem: 'item-1',
    ...overrides,
})

describe('assignByStartNumber', () => {
    test('schlägt für eine bestätigte Anfrage ohne Grundzuteilung das Stück mit passender Nummer vor', () => {
        const result = assignByStartNumber([request()], [item()])
        expect(result).toEqual([
            {requestId: 'req-1', entries: [{materialItem: 'item-1', competitionMatch: null}]},
        ])
    })

    test('eine Anfrage mit vorhandener Grundzuteilung bekommt keinen Vorschlag', () => {
        const req = request({assignments: [assignment({competitionMatch: undefined})]})
        const result = assignByStartNumber([req], [item()])
        expect(result).toEqual([])
    })

    test('ein stillgelegtes Stück wird übersprungen', () => {
        const retired = item({status: 'RETIRED'})
        const result = assignByStartNumber([request()], [retired])
        expect(result).toEqual([])
    })

    test('ein Stück mit falschem Materialtyp wird übersprungen', () => {
        const otherType = item({materialType: 'type-andere'})
        const result = assignByStartNumber([request()], [otherType])
        expect(result).toEqual([])
    })

    test('eine Anfrage ohne Startnummer wird übersprungen', () => {
        const req = request({teamNumber: undefined})
        const result = assignByStartNumber([req], [item()])
        expect(result).toEqual([])
    })

    test('eine nicht bestätigte Anfrage wird übersprungen', () => {
        const req = request({status: 'WAITLISTED'})
        const result = assignByStartNumber([req], [item()])
        expect(result).toEqual([])
    })
})

describe('deviatesFromStartNumber', () => {
    test('keine Abweichung, wenn ein Stück der Grundzuteilung die Startnummer trägt', () => {
        const req = request({assignments: [assignment({materialItem: 'item-1', competitionMatch: undefined})]})
        expect(deviatesFromStartNumber(req, [item()])).toBe(false)
    })

    test('Abweichung, wenn kein Stück der Grundzuteilung die Startnummer trägt', () => {
        const req = request({assignments: [assignment({materialItem: 'item-2', competitionMatch: undefined})]})
        const otherItem = item({id: 'item-2', number: 9})
        expect(deviatesFromStartNumber(req, [otherItem])).toBe(true)
    })

    test('keine Abweichung ohne jede Grundzuteilung', () => {
        const req = request({assignments: []})
        expect(deviatesFromStartNumber(req, [item()])).toBe(false)
    })

    test('nur Ausnahmen ohne Grundzuteilung zählen nicht als Grundzuteilung', () => {
        const req = request({assignments: [assignment({materialItem: 'item-1', competitionMatch: 'match-1'})]})
        expect(deviatesFromStartNumber(req, [item()])).toBe(false)
    })
})

describe('Startnummer im Lauf', () => {
    test('startNumberOf nimmt die Startnummer im Lauf, sonst die Meldungsnummer', () => {
        expect(startNumberOf({startNumber: 3, teamNumber: 7})).toBe(3)
        expect(startNumberOf({teamNumber: 7})).toBe(7)
        expect(startNumberOf({})).toBeUndefined()
    })

    test('Zuteilung nach Startnummer folgt der Startnummer im Lauf', () => {
        const items = [item({id: 'i3', number: 3}), item({id: 'i7', number: 7})]
        expect(assignByStartNumber([request({startNumber: 3, teamNumber: 7})], items)).toEqual([
            {requestId: 'req-1', entries: [{materialItem: 'i3', competitionMatch: null}]},
        ])
    })

    test('Abweichung wird gegen die Startnummer im Lauf gerechnet', () => {
        const items = [item({id: 'i3', number: 3}), item({id: 'i7', number: 7})]
        const base = (id: string) => [assignment({id: `a-${id}`, materialItem: id})]
        expect(
            deviatesFromStartNumber(request({startNumber: 3, teamNumber: 7, assignments: base('i3')}), items),
        ).toBe(false)
        expect(
            deviatesFromStartNumber(request({startNumber: 3, teamNumber: 7, assignments: base('i7')}), items),
        ).toBe(true)
    })
})
