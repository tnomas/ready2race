import {describe, expect, test} from 'vitest'
import {MaterialOverviewItemDto, MaterialOverviewMatchDto} from '@api/types.gen.ts'
import {DEFAULT_MATCH_MINUTES, findConflicts, severityOf} from './conflicts.ts'
import {EffectiveAssignment} from './effectiveAssignments.ts'

const match = (overrides: Partial<MaterialOverviewMatchDto> = {}): MaterialOverviewMatchDto => ({
    id: 'match-1',
    competition: 'comp-1',
    registrationIds: ['reg-1'],
    ...overrides,
})

const item = (overrides: Partial<MaterialOverviewItemDto> = {}): MaterialOverviewItemDto => ({
    id: 'item-1',
    materialType: 'type-1',
    materialTypeName: 'Zweier',
    category: 'BOAT',
    label: 'Boot 1',
    status: 'ACTIVE',
    outages: [],
    ...overrides,
})

const eff = (overrides: Partial<EffectiveAssignment> = {}): EffectiveAssignment => ({
    requestId: 'req-1',
    matchId: 'match-1',
    itemIds: ['item-1'],
    isException: false,
    ...overrides,
})

describe('findConflicts', () => {
    test('zwei Läufe desselben Stücks zur gleichen Startzeit ergeben OVERLAP', () => {
        const matches = [
            match({id: 'm1', startTime: '2026-09-07T10:00:00Z', endTime: '2026-09-07T10:10:00Z'}),
            match({id: 'm2', startTime: '2026-09-07T10:05:00Z', endTime: '2026-09-07T10:15:00Z'}),
        ]
        const effective = [
            eff({requestId: 'r1', matchId: 'm1', itemIds: ['item-1']}),
            eff({requestId: 'r2', matchId: 'm2', itemIds: ['item-1']}),
        ]
        const result = findConflicts(effective, matches, [item()], {})
        expect(result).toEqual([
            {kind: 'OVERLAP', itemId: 'item-1', matchIds: ['m1', 'm2'], requestIds: ['r1', 'r2']},
        ])
    })

    test('Wechselzeit 30 Minuten bei Abstand 20 Minuten ergibt CHANGEOVER', () => {
        const matches = [
            match({id: 'm1', startTime: '2026-09-07T10:00:00Z', endTime: '2026-09-07T10:10:00Z'}),
            match({id: 'm2', startTime: '2026-09-07T10:30:00Z', endTime: '2026-09-07T10:40:00Z'}),
        ]
        const effective = [
            eff({requestId: 'r1', matchId: 'm1', itemIds: ['item-1']}),
            eff({requestId: 'r2', matchId: 'm2', itemIds: ['item-1']}),
        ]
        const result = findConflicts(effective, matches, [item()], {r2: 30})
        expect(result).toEqual([
            {kind: 'CHANGEOVER', itemId: 'item-1', matchIds: ['m1', 'm2'], requestIds: ['r1', 'r2']},
        ])
    })

    test('Wechselzeit 30 Minuten bei Abstand 45 Minuten ergibt keinen Konflikt', () => {
        const matches = [
            match({id: 'm1', startTime: '2026-09-07T10:00:00Z', endTime: '2026-09-07T10:10:00Z'}),
            match({id: 'm2', startTime: '2026-09-07T10:55:00Z', endTime: '2026-09-07T11:05:00Z'}),
        ]
        const effective = [
            eff({requestId: 'r1', matchId: 'm1', itemIds: ['item-1']}),
            eff({requestId: 'r2', matchId: 'm2', itemIds: ['item-1']}),
        ]
        const result = findConflicts(effective, matches, [item()], {r2: 30})
        expect(result).toEqual([])
    })

    test('ein offener Ausfall ab einem Zeitpunkt trifft den späteren Lauf, nicht den früheren', () => {
        const matches = [
            match({id: 'm1', startTime: '2026-09-07T09:00:00Z', endTime: '2026-09-07T09:10:00Z'}),
            match({id: 'm2', startTime: '2026-09-07T11:00:00Z', endTime: '2026-09-07T11:10:00Z'}),
        ]
        const effective = [
            eff({requestId: 'r1', matchId: 'm1', itemIds: ['item-1']}),
            eff({requestId: 'r2', matchId: 'm2', itemIds: ['item-1']}),
        ]
        const damaged = item({outages: [{damageId: 'd1', from: '2026-09-07T10:00:00Z'}]})
        const result = findConflicts(effective, matches, [damaged], {})
        expect(result).toEqual([
            {kind: 'OUTAGE', itemId: 'item-1', matchIds: ['m2'], requestIds: ['r2']},
        ])
    })

    test('ein Lauf ohne startTime wird bei OVERLAP/CHANGEOVER/OUTAGE übersprungen', () => {
        const matches = [
            match({id: 'm1'}),
            match({id: 'm2', startTime: '2026-09-07T10:00:00Z', endTime: '2026-09-07T10:10:00Z'}),
        ]
        const effective = [
            eff({requestId: 'r1', matchId: 'm1', itemIds: ['item-1']}),
            eff({requestId: 'r2', matchId: 'm2', itemIds: ['item-1']}),
        ]
        const result = findConflicts(effective, matches, [item()], {})
        expect(result).toEqual([])
    })

    test('ein stillgelegtes Stück mit einer wirksamen Zuteilung ergibt RETIRED', () => {
        const matches = [match({id: 'm1', startTime: '2026-09-07T10:00:00Z'})]
        const effective = [eff({requestId: 'r1', matchId: 'm1', itemIds: ['item-1']})]
        const retired = item({status: 'RETIRED'})
        const result = findConflicts(effective, matches, [retired], {})
        expect(result).toEqual([
            {kind: 'RETIRED', itemId: 'item-1', matchIds: ['m1'], requestIds: ['r1']},
        ])
    })

    test('ein Lauf ohne endTime gilt als DEFAULT_MATCH_MINUTES lang', () => {
        expect(DEFAULT_MATCH_MINUTES).toBe(15)
        const matches = [
            match({id: 'm1', startTime: '2026-09-07T10:00:00Z'}),
            match({id: 'm2', startTime: '2026-09-07T10:14:00Z', endTime: '2026-09-07T10:20:00Z'}),
        ]
        const effective = [
            eff({requestId: 'r1', matchId: 'm1', itemIds: ['item-1']}),
            eff({requestId: 'r2', matchId: 'm2', itemIds: ['item-1']}),
        ]
        const result = findConflicts(effective, matches, [item()], {})
        expect(result).toEqual([
            {kind: 'OVERLAP', itemId: 'item-1', matchIds: ['m1', 'm2'], requestIds: ['r1', 'r2']},
        ])
    })
})

describe('severityOf', () => {
    test('OVERLAP ist ein Fehler', () => {
        expect(severityOf('OVERLAP')).toBe('error')
    })

    test('OUTAGE ist ein Fehler', () => {
        expect(severityOf('OUTAGE')).toBe('error')
    })

    test('RETIRED ist ein Fehler', () => {
        expect(severityOf('RETIRED')).toBe('error')
    })

    test('CHANGEOVER ist eine Warnung', () => {
        expect(severityOf('CHANGEOVER')).toBe('warning')
    })
})
