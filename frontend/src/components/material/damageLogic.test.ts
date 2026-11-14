import {describe, expect, test} from 'vitest'
import {MaterialOverviewMatchDto, MaterialOverviewRequestDto} from '@api/types.gen.ts'
import {
    causerCandidates,
    needsOutageImpact,
    outageUntilFollowsRepair,
    outageUntilShownForRepair,
    suggestCauser,
} from './damageLogic.ts'

const request = (
    overrides: Partial<MaterialOverviewRequestDto> = {},
): MaterialOverviewRequestDto => ({
    id: 'req-1',
    materialOffer: 'offer-1',
    materialType: 'type-1',
    materialTypeName: 'Vierer',
    category: 'BOAT',
    count: 1,
    status: 'CONFIRMED',
    requestedAt: '2026-09-07T08:00:00Z',
    competitionRegistration: 'reg-1',
    competition: 'comp-1',
    competitionIdentifier: 'M1',
    competitionName: 'Wettkampf',
    clubId: 'club-1',
    clubName: 'Verein 1',
    assignments: [],
    ...overrides,
})

const match = (overrides: Partial<MaterialOverviewMatchDto>): MaterialOverviewMatchDto => ({
    id: 'm-1',
    competition: 'comp-1',
    startTime: '2026-09-07T10:00:00',
    endTime: '2026-09-07T10:20:00',
    registrationIds: ['reg-1'],
    teams: [],
    ...overrides,
})

describe('causerCandidates', () => {
    test('nur bestätigte, je Meldung einmal', () => {
        const result = causerCandidates([
            request({id: 'a'}),
            request({id: 'b'}),
            request({id: 'c', competitionRegistration: 'reg-2', status: 'REQUESTED'}),
            request({id: 'd', competitionRegistration: 'reg-3'}),
        ])
        expect(result.map(r => r.id)).toEqual(['a', 'd'])
    })
})

describe('suggestCauser', () => {
    const time = (s: string) => new Date(s).getTime()

    test('schlägt das Team vor, in dessen Lauf das Stück zum Meldezeitpunkt fuhr', () => {
        const overview = {
            requests: [
                request({id: 'a', assignments: [{id: 'x', materialItem: 'boot7'}]}),
                request({
                    id: 'b',
                    competitionRegistration: 'reg-2',
                    assignments: [{id: 'y', materialItem: 'boot7', competitionMatch: 'm-2'}],
                }),
            ],
            matches: [
                match({id: 'm-1'}),
                match({
                    id: 'm-2',
                    startTime: '2026-09-07T11:00:00',
                    endTime: '2026-09-07T11:20:00',
                    registrationIds: ['reg-2'],
                }),
            ],
        }
        expect(suggestCauser(overview, 'boot7', time('2026-09-07T10:10:00'))?.id).toBe('a')
        expect(suggestCauser(overview, 'boot7', time('2026-09-07T11:05:00'))?.id).toBe('b')
    })

    test('außerhalb jedes Laufs oder ohne gültige Zeit kein Vorschlag', () => {
        const overview = {
            requests: [request({assignments: [{id: 'x', materialItem: 'boot7'}]})],
            matches: [match({})],
        }
        expect(suggestCauser(overview, 'boot7', time('2026-09-07T12:00:00'))).toBeNull()
        expect(suggestCauser(overview, 'boot7', NaN)).toBeNull()
        expect(suggestCauser(overview, 'boot8', time('2026-09-07T10:10:00'))).toBeNull()
    })
})

describe('needsOutageImpact', () => {
    test('nur offene Schäden mit Ausfall ab', () => {
        expect(needsOutageImpact({status: 'REPORTED', outOfServiceFrom: '2026-09-07T10:00'})).toBe(
            true,
        )
        expect(needsOutageImpact({status: 'REPAIRED', outOfServiceFrom: '2026-09-07T10:00'})).toBe(
            false,
        )
        expect(needsOutageImpact({status: 'REPORTED'})).toBe(false)
    })
})

describe('outageUntilFollowsRepair', () => {
    test('leeres Ende folgt der Reparatur', () => {
        expect(outageUntilFollowsRepair(undefined, '2026-11-04T10:30:00')).toBe(true)
        expect(outageUntilFollowsRepair('', undefined)).toBe(true)
    })
    test('vom Server übernommenes Ende (= Reparatur) folgt weiter', () => {
        expect(outageUntilFollowsRepair('2026-11-04T10:30:00', '2026-11-04T10:30:00')).toBe(true)
    })
    test('selbst gesetztes Ende bleibt stehen', () => {
        expect(outageUntilFollowsRepair('2026-11-03T18:00:00', '2026-11-04T10:30:00')).toBe(false)
    })
})

describe('outageUntilShownForRepair', () => {
    test('zeigt den Reparaturzeitpunkt sofort, solange das Feld der Reparatur folgt', () => {
        expect(outageUntilShownForRepair('REPAIRED', '2026-08-16T09:00', true)).toBe(
            '2026-08-16T09:00',
        )
    })
    test('lässt ein eigenes Ende, ein nicht repariertes Stück und ein leeres Datum in Ruhe', () => {
        expect(outageUntilShownForRepair('REPAIRED', '2026-08-16T09:00', false)).toBeUndefined()
        expect(outageUntilShownForRepair('REPORTED', '2026-08-16T09:00', true)).toBeUndefined()
        expect(outageUntilShownForRepair('REPAIRED', undefined, true)).toBeUndefined()
        expect(outageUntilShownForRepair('REPAIRED', '', true)).toBeUndefined()
    })
})
