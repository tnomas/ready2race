import {describe, expect, test} from 'vitest'
import {
    MaterialAssignmentDto,
    MaterialOverviewItemDto,
    MaterialOverviewRequestDto,
} from '@api/types.gen.ts'
import {
    assignByTeamNumber,
    deviatesFromTeamNumber,
    deviatesInMatch,
    deviatingMatchCount,
    startNumberInMatch,
    teamNumberOf,
    withoutNumberMatch,
} from './materialNumbers.ts'

const request = (
    overrides: Partial<MaterialOverviewRequestDto> = {},
): MaterialOverviewRequestDto => ({
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

describe('teamNumberOf / startNumberInMatch', () => {
    test('die Meldungsnummer fällt nie auf die Startnummer zurück', () => {
        expect(teamNumberOf({teamNumber: 7})).toBe(7)
        expect(teamNumberOf({})).toBeUndefined()
    })

    test('Startnummer je Lauf gehört genau zu diesem Lauf', () => {
        const match = {
            id: 'm-1',
            teams: [
                {competitionRegistration: 'reg-1', startNumber: 2},
                {competitionRegistration: 'reg-2', startNumber: 1},
            ],
        }
        expect(startNumberInMatch(match, 'reg-1')).toBe(2)
        expect(startNumberInMatch(match, 'reg-3')).toBeUndefined()
        expect(startNumberInMatch({id: 'm-2'}, 'reg-1')).toBeUndefined()
        expect(startNumberInMatch(undefined, 'reg-1')).toBeUndefined()
    })
})

describe('assignByTeamNumber', () => {
    test('schlägt für eine bestätigte Anfrage ohne Grundzuteilung das Stück mit der Meldungsnummer vor', () => {
        expect(assignByTeamNumber([request()], [item()])).toEqual([
            {requestId: 'req-1', entries: [{materialItem: 'item-1', competitionMatch: null}]},
        ])
    })

    test('rechnet gegen die Meldungsnummer, nicht gegen die Startnummer im ersten Lauf', () => {
        const items = [item({id: 'i3', number: 3}), item({id: 'i7', number: 7})]
        expect(assignByTeamNumber([request({startNumber: 3, teamNumber: 7})], items)).toEqual([
            {requestId: 'req-1', entries: [{materialItem: 'i7', competitionMatch: null}]},
        ])
    })

    test('vorhandene Grundzuteilung, stillgelegtes Stück, falsche Art, keine Meldungsnummer, nicht bestätigt: kein Vorschlag', () => {
        expect(assignByTeamNumber([request({assignments: [assignment()]})], [item()])).toEqual([])
        expect(assignByTeamNumber([request()], [item({status: 'RETIRED'})])).toEqual([])
        expect(assignByTeamNumber([request()], [item({materialType: 'andere'})])).toEqual([])
        expect(
            assignByTeamNumber([request({teamNumber: undefined, startNumber: 7})], [item()]),
        ).toEqual([])
        expect(assignByTeamNumber([request({status: 'WAITLISTED'})], [item()])).toEqual([])
    })

    test('doppelte Meldungsnummer im selben Wettkampf: das Stück geht nur an die ältere Anfrage', () => {
        const older = request({
            id: 'alt',
            competitionRegistration: 'r-a',
            requestedAt: '2026-09-07T08:00:00Z',
        })
        const newer = request({
            id: 'neu',
            competitionRegistration: 'r-b',
            requestedAt: '2026-09-07T09:00:00Z',
        })
        expect(assignByTeamNumber([newer, older], [item()])).toEqual([
            {requestId: 'alt', entries: [{materialItem: 'item-1', competitionMatch: null}]},
        ])
    })

    test('ein im Wettkampf schon zugeteiltes Stück wird keinem zweiten Team vorgeschlagen', () => {
        const holder = request({id: 'hat', teamNumber: 3, assignments: [assignment()]})
        const other = request({id: 'will', competitionRegistration: 'reg-2'})
        expect(assignByTeamNumber([holder, other], [item()])).toEqual([])
    })

    test('dasselbe Boot in verschiedenen Wettkämpfen ist erlaubt', () => {
        const a = request({id: 'a'})
        const b = request({id: 'b', competition: 'comp-2', competitionRegistration: 'reg-2'})
        expect(assignByTeamNumber([a, b], [item()]).map(p => p.requestId)).toEqual(['a', 'b'])
    })
})

describe('deviatesFromTeamNumber', () => {
    test('keine Abweichung, wenn ein Stück der Grundzuteilung die Meldungsnummer trägt', () => {
        expect(deviatesFromTeamNumber(request({assignments: [assignment()]}), [item()])).toBe(false)
    })

    test('Abweichung, wenn kein Stück der Grundzuteilung die Meldungsnummer trägt', () => {
        const req = request({assignments: [assignment({materialItem: 'item-2'})]})
        expect(deviatesFromTeamNumber(req, [item({id: 'item-2', number: 9})])).toBe(true)
    })

    test('die Startnummer im ersten Lauf spielt keine Rolle', () => {
        const req = request({startNumber: 1, assignments: [assignment()]})
        expect(deviatesFromTeamNumber(req, [item()])).toBe(false)
    })

    test('ohne Grundzuteilung oder ohne Meldungsnummer keine Abweichung', () => {
        expect(deviatesFromTeamNumber(request(), [item()])).toBe(false)
        expect(
            deviatesFromTeamNumber(
                request({assignments: [assignment({competitionMatch: 'm-1'})]}),
                [item({number: 9})],
            ),
        ).toBe(false)
        expect(
            deviatesFromTeamNumber(request({teamNumber: undefined, assignments: [assignment()]}), [
                item({number: 9}),
            ]),
        ).toBe(false)
    })
})

describe('deviatesInMatch', () => {
    const items = [item({id: 'i2', number: 2}), item({id: 'i7', number: 7})]

    test('vergleicht mit der Startnummer in diesem Lauf', () => {
        expect(deviatesInMatch(['i2'], 2, items)).toBe(false)
        expect(deviatesInMatch(['i7'], 1, items)).toBe(true)
        expect(deviatesInMatch(['i2', 'i7'], 7, items)).toBe(false)
    })

    test('ohne Startnummer oder ohne Stück keine Abweichung', () => {
        expect(deviatesInMatch(['i7'], undefined, items)).toBe(false)
        expect(deviatesInMatch([], 1, items)).toBe(false)
    })
})

describe('withoutNumberMatch', () => {
    test('meldet bestätigte Teams, deren Meldungsnummer in der aktiven Flotte fehlt', () => {
        const items = [
            item({id: 'i3', number: 3}),
            item({id: 'i4', number: 4, status: 'RETIRED'}),
            item({id: 'x4', number: 4, materialType: 'andere'}),
        ]
        const requests = [
            request({id: 'passt', teamNumber: 3}),
            request({id: 'ausgemustert', teamNumber: 4}),
            request({id: 'drüber', teamNumber: 9}),
            request({id: 'ohneNummer', teamNumber: undefined}),
            request({id: 'offen', teamNumber: 9, status: 'REQUESTED'}),
        ]
        expect([...withoutNumberMatch(requests, items)]).toEqual(['ausgemustert', 'drüber'])
    })
})

describe('deviatingMatchCount', () => {
    const items = [
        item({id: 'b7', number: 7}),
        item({id: 'b8', number: 8}),
        item({id: 'b2', number: 2}),
    ]
    const m = (id: string, startNumber: number, registrationIds = ['reg-1']) => ({
        id,
        competition: 'comp-1',
        registrationIds,
        teams: registrationIds.map(r => ({competitionRegistration: r, startNumber})),
    })

    test('zählt Läufe, in denen das wirksame Stück nicht die Startnummer dort trägt', () => {
        const req = request({
            assignments: [
                assignment({id: 'g', materialItem: 'b7'}),
                assignment({id: 'x', materialItem: 'b8', competitionMatch: 'vorlauf2'}),
            ],
        })
        const matches = [
            m('vorlauf1', 7),
            m('vorlauf2', 8),
            m('finale', 1),
            m('fremd', 3, ['reg-9']),
        ]
        expect(deviatingMatchCount(req, matches, items)).toBe(1)
    })

    test('ohne Startnummern im Lauf keine Abweichung', () => {
        const req = request({assignments: [assignment({materialItem: 'b2'})]})
        expect(
            deviatingMatchCount(
                req,
                [{id: 'm', competition: 'c', registrationIds: ['reg-1'], teams: []}],
                items,
            ),
        ).toBe(0)
    })
})
