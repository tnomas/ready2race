import {describe, expect, test} from 'vitest'
import {MaterialOverviewItemDto, MaterialOverviewMatchDto} from '@api/types.gen.ts'
import {affectedByOutage, replacementCandidates} from './affectedByOutage.ts'
import {EffectiveAssignment} from './effectiveAssignments.ts'

const match = (overrides: Partial<MaterialOverviewMatchDto> = {}): MaterialOverviewMatchDto => ({
    id: 'match-1',
    competition: 'comp-1',
    registrationIds: ['reg-1'],
    teams: [],
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

describe('affectedByOutage', () => {
    test('ein Lauf im offenen Ausfallfenster ist betroffen', () => {
        const matches = [match({id: 'm1', startTime: '2026-09-07T10:00:00Z', endTime: '2026-09-07T10:10:00Z'})]
        const effective = [eff({requestId: 'r1', matchId: 'm1', itemIds: ['item-1']})]
        const result = affectedByOutage(effective, matches, 'item-1', '2026-09-07T09:00:00Z')
        expect(result).toEqual([{requestId: 'r1', matchId: 'm1'}])
    })

    test('ein Lauf vor dem Ausfallbeginn ist nicht betroffen', () => {
        const matches = [match({id: 'm1', startTime: '2026-09-07T08:00:00Z', endTime: '2026-09-07T08:10:00Z'})]
        const effective = [eff({requestId: 'r1', matchId: 'm1', itemIds: ['item-1']})]
        const result = affectedByOutage(effective, matches, 'item-1', '2026-09-07T09:00:00Z')
        expect(result).toEqual([])
    })

    test('ein Lauf nach dem Ausfallende ist nicht betroffen', () => {
        const matches = [match({id: 'm1', startTime: '2026-09-07T12:00:00Z', endTime: '2026-09-07T12:10:00Z'})]
        const effective = [eff({requestId: 'r1', matchId: 'm1', itemIds: ['item-1']})]
        const result = affectedByOutage(
            effective,
            matches,
            'item-1',
            '2026-09-07T09:00:00Z',
            '2026-09-07T10:00:00Z',
        )
        expect(result).toEqual([])
    })

    test('ein anderes Stück ist nie betroffen', () => {
        const matches = [match({id: 'm1', startTime: '2026-09-07T10:00:00Z', endTime: '2026-09-07T10:10:00Z'})]
        const effective = [eff({requestId: 'r1', matchId: 'm1', itemIds: ['item-2']})]
        const result = affectedByOutage(effective, matches, 'item-1', '2026-09-07T09:00:00Z')
        expect(result).toEqual([])
    })

    test('ein Lauf ohne startTime trägt nichts bei', () => {
        const matches = [match({id: 'm1'})]
        const effective = [eff({requestId: 'r1', matchId: 'm1', itemIds: ['item-1']})]
        const result = affectedByOutage(effective, matches, 'item-1', '2026-09-07T09:00:00Z')
        expect(result).toEqual([])
    })

    test('mehrere betroffene Läufe kommen alle in der Liste vor', () => {
        const matches = [
            match({id: 'm1', startTime: '2026-09-07T10:00:00Z', endTime: '2026-09-07T10:10:00Z'}),
            match({id: 'm2', startTime: '2026-09-07T11:00:00Z', endTime: '2026-09-07T11:10:00Z'}),
        ]
        const effective = [
            eff({requestId: 'r1', matchId: 'm1', itemIds: ['item-1']}),
            eff({requestId: 'r2', matchId: 'm2', itemIds: ['item-1']}),
        ]
        const result = affectedByOutage(effective, matches, 'item-1', '2026-09-07T09:00:00Z')
        expect(result).toEqual([
            {requestId: 'r1', matchId: 'm1'},
            {requestId: 'r2', matchId: 'm2'},
        ])
    })
})

describe('replacementCandidates', () => {
    test('ein freies aktives Stück derselben Art ist ein Kandidat', () => {
        const matches = [match({id: 'm1', startTime: '2026-09-07T10:00:00Z', endTime: '2026-09-07T10:10:00Z'})]
        const items = [item({id: 'item-1'}), item({id: 'item-2'})]
        const effective = [eff({requestId: 'r1', matchId: 'm1', itemIds: ['item-1']})]
        const result = replacementCandidates(items, effective, matches, 'm1', 'type-1', undefined)
        expect(result).toEqual([{item: items[1], sameNumber: false}])
    })

    test('ein stillgelegtes Stück ist kein Kandidat', () => {
        const matches = [match({id: 'm1', startTime: '2026-09-07T10:00:00Z', endTime: '2026-09-07T10:10:00Z'})]
        const items = [item({id: 'item-1'}), item({id: 'item-2', status: 'RETIRED'})]
        const effective = [eff({requestId: 'r1', matchId: 'm1', itemIds: ['item-1']})]
        const result = replacementCandidates(items, effective, matches, 'm1', 'type-1', undefined)
        expect(result).toEqual([])
    })

    test('ein Stück einer anderen Materialart ist kein Kandidat', () => {
        const matches = [match({id: 'm1', startTime: '2026-09-07T10:00:00Z', endTime: '2026-09-07T10:10:00Z'})]
        const items = [item({id: 'item-1'}), item({id: 'item-2', materialType: 'type-2'})]
        const effective = [eff({requestId: 'r1', matchId: 'm1', itemIds: ['item-1']})]
        const result = replacementCandidates(items, effective, matches, 'm1', 'type-1', undefined)
        expect(result).toEqual([])
    })

    test('ein Stück mit eigener Zuteilung im selben Lauffenster ist kein Kandidat', () => {
        const matches = [match({id: 'm1', startTime: '2026-09-07T10:00:00Z', endTime: '2026-09-07T10:10:00Z'})]
        const items = [item({id: 'item-1'}), item({id: 'item-2'})]
        const effective = [
            eff({requestId: 'r1', matchId: 'm1', itemIds: ['item-1']}),
            eff({requestId: 'r2', matchId: 'm1', itemIds: ['item-2']}),
        ]
        const result = replacementCandidates(items, effective, matches, 'm1', 'type-1', undefined)
        expect(result).toEqual([])
    })

    test('ein Stück im Ausfallfenster während des Laufs ist kein Kandidat', () => {
        const matches = [match({id: 'm1', startTime: '2026-09-07T10:00:00Z', endTime: '2026-09-07T10:10:00Z'})]
        const items = [
            item({id: 'item-1'}),
            item({id: 'item-2', outages: [{damageId: 'd1', from: '2026-09-07T09:00:00Z'}]}),
        ]
        const effective = [eff({requestId: 'r1', matchId: 'm1', itemIds: ['item-1']})]
        const result = replacementCandidates(items, effective, matches, 'm1', 'type-1', undefined)
        expect(result).toEqual([])
    })

    test('Nummerngleichheit wird markiert und zuerst sortiert', () => {
        const matches = [match({id: 'm1', startTime: '2026-09-07T10:00:00Z', endTime: '2026-09-07T10:10:00Z'})]
        const items = [
            item({id: 'item-1'}),
            item({id: 'item-2', number: 5}),
            item({id: 'item-3', number: 3}),
        ]
        const effective = [eff({requestId: 'r1', matchId: 'm1', itemIds: ['item-1']})]
        const result = replacementCandidates(items, effective, matches, 'm1', 'type-1', 3)
        expect(result).toEqual([
            {item: items[2], sameNumber: true},
            {item: items[1], sameNumber: false},
        ])
    })

    test('ein Lauf ohne startTime liefert keine Kandidaten', () => {
        const matches = [match({id: 'm1'})]
        const items = [item({id: 'item-2'})]
        const result = replacementCandidates(items, [], matches, 'm1', 'type-1', undefined)
        expect(result).toEqual([])
    })
})
