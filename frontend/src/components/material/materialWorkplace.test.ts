import {describe, expect, it} from 'vitest'
import {MaterialOverviewItemDto, MaterialOverviewRequestDto} from '@api/types.gen.ts'
import {
    assignmentRowsForWork,
    assignmentState,
    assignmentWork,
    damageFilterCounts,
    itemLabel,
    matchesDamageFilter,
    matchesRequestFilter,
    requestActionPlan,
    requestFilterCounts,
    sortDamagesForWork,
    sortRequestsForWork,
} from './materialWorkplace.ts'
import {MaterialConflict} from './conflicts.ts'

const request = (
    overrides: Partial<MaterialOverviewRequestDto> = {},
): MaterialOverviewRequestDto => ({
    id: 'r1',
    materialOffer: 'o1',
    materialType: 't1',
    materialTypeName: 'C4x+',
    category: 'BOAT',
    count: 1,
    status: 'REQUESTED',
    requestedAt: '2026-09-01T10:00:00Z',
    competitionRegistration: 'cr1',
    competition: 'c1',
    competitionIdentifier: '1',
    competitionName: 'Vierer',
    clubId: 'club1',
    clubName: 'RV Nord',
    assignments: [],
    ...overrides,
})

const item = (overrides: Partial<MaterialOverviewItemDto> = {}): MaterialOverviewItemDto => ({
    id: 'i1',
    materialType: 't1',
    materialTypeName: 'C4x+',
    category: 'BOAT',
    label: 'Boot 1',
    number: 1,
    status: 'ACTIVE',
    outages: [],
    ...overrides,
})

describe('Anfragen-Filter', () => {
    it('„Offen" umfasst angefragt und Warteliste', () => {
        expect(matchesRequestFilter('REQUESTED', 'OPEN')).toBe(true)
        expect(matchesRequestFilter('WAITLISTED', 'OPEN')).toBe(true)
        expect(matchesRequestFilter('CONFIRMED', 'OPEN')).toBe(false)
        expect(matchesRequestFilter('WITHDRAWN', 'ALL')).toBe(true)
        expect(matchesRequestFilter('DECLINED', 'DECLINED')).toBe(true)
    })

    it('zählt je Filter', () => {
        const counts = requestFilterCounts([
            {status: 'REQUESTED'},
            {status: 'WAITLISTED'},
            {status: 'CONFIRMED'},
            {status: 'WITHDRAWN'},
        ])
        expect(counts).toEqual({OPEN: 2, CONFIRMED: 1, DECLINED: 0, WITHDRAWN: 1, ALL: 4})
    })

    it('sortiert offene Arbeit zuerst, innerhalb nach Anfragezeit', () => {
        const sorted = sortRequestsForWork([
            request({id: 'c', status: 'CONFIRMED', requestedAt: '2026-09-01T08:00:00Z'}),
            request({id: 'w', status: 'WAITLISTED', requestedAt: '2026-09-01T07:00:00Z'}),
            request({id: 'r2', status: 'REQUESTED', requestedAt: '2026-09-01T12:00:00Z'}),
            request({id: 'r1', status: 'REQUESTED', requestedAt: '2026-09-01T09:00:00Z'}),
        ])
        expect(sorted.map(r => r.id)).toEqual(['r1', 'r2', 'w', 'c'])
    })
})

describe('requestActionPlan', () => {
    it('Bestätigen ist Primäraktion offener Anfragen', () => {
        expect(requestActionPlan('REQUESTED')).toEqual({
            primary: 'CONFIRMED',
            more: ['WAITLISTED', 'DECLINED'],
        })
        expect(requestActionPlan('WAITLISTED')).toEqual({primary: 'CONFIRMED', more: ['DECLINED']})
    })

    it('Entschiedenes hat keine Primäraktion, nur das Menü', () => {
        expect(requestActionPlan('CONFIRMED').primary).toBeUndefined()
        expect(requestActionPlan('CONFIRMED').more).toEqual(['WAITLISTED', 'DECLINED'])
        expect(requestActionPlan('DECLINED').more).toEqual(['CONFIRMED', 'WAITLISTED'])
        expect(requestActionPlan('WITHDRAWN')).toEqual({more: []})
    })
})

describe('Zuteilung', () => {
    const base = (itemId: string) => ({id: `a-${itemId}`, materialItem: itemId})

    it('erkennt fehlende, abweichende und passende Zuteilung', () => {
        const items = [item({id: 'i1', number: 1}), item({id: 'i7', number: 7})]
        expect(assignmentState(request({teamNumber: 1}), items)).toBe('unassigned')
        expect(assignmentState(request({teamNumber: 1, assignments: [base('i7')]}), items)).toBe(
            'deviates',
        )
        expect(assignmentState(request({teamNumber: 1, assignments: [base('i1')]}), items)).toBe(
            'assigned',
        )
    })

    it('stellt Unzugeteiltes vor Konflikte vor den Rest und lässt Unbestätigtes weg', () => {
        const conflicts: MaterialConflict[] = [
            {kind: 'OVERLAP', itemId: 'i1', matchIds: ['m1'], requestIds: ['konflikt']},
        ]
        const rows = assignmentRowsForWork(
            [
                request({id: 'ok', status: 'CONFIRMED', assignments: [base('i2')]}),
                request({id: 'konflikt', status: 'CONFIRMED', assignments: [base('i1')]}),
                request({id: 'offen', status: 'CONFIRMED'}),
                request({id: 'angefragt', status: 'REQUESTED'}),
            ],
            conflicts,
        )
        expect(rows.map(r => r.id)).toEqual(['offen', 'konflikt', 'ok'])
        expect(
            assignmentWork(
                [
                    request({id: 'offen', status: 'CONFIRMED'}),
                    request({id: 'konflikt', status: 'CONFIRMED', assignments: [base('i1')]}),
                ],
                conflicts,
            ),
        ).toEqual({unassigned: 1, withConflicts: 1})
    })

    it('sortiert Kennungen numerisch und dann nach Startnummer', () => {
        const rows = assignmentRowsForWork(
            [
                request({id: 'b', status: 'CONFIRMED', competitionIdentifier: '10', teamNumber: 1}),
                request({id: 'a2', status: 'CONFIRMED', competitionIdentifier: '2', teamNumber: 3}),
                request({id: 'a1', status: 'CONFIRMED', competitionIdentifier: '2', teamNumber: 1}),
            ],
            [],
        )
        expect(rows.map(r => r.id)).toEqual(['a1', 'a2', 'b'])
    })

    it('beschriftet Stücke mit und ohne Nummer', () => {
        expect(itemLabel({label: 'Möwe', number: 3})).toBe('Möwe #3')
        expect(itemLabel({label: 'Möwe'})).toBe('Möwe')
    })
})

describe('Schäden', () => {
    it('filtert und zählt offene und reparierte Schäden', () => {
        const damages = [{status: 'REPORTED' as const}, {status: 'REPAIRED' as const}]
        expect(matchesDamageFilter(damages[0], 'OPEN')).toBe(true)
        expect(matchesDamageFilter(damages[1], 'OPEN')).toBe(false)
        expect(damageFilterCounts(damages)).toEqual({OPEN: 1, REPAIRED: 1, ALL: 2})
    })

    it('zeigt die neueste Meldung zuerst', () => {
        const sorted = sortDamagesForWork([
            {id: 'alt', reportedAt: '2026-09-01T08:00:00'},
            {id: 'neu', reportedAt: '2026-09-02T08:00:00'},
        ])
        expect(sorted.map(d => d.id)).toEqual(['neu', 'alt'])
    })
})
