import {describe, expect, test} from 'vitest'
import {TimingTeamDto} from '@api/types.gen.ts'
import {orderTeamsForBoard} from './teamOrder.ts'

const team = (overrides: Partial<TimingTeamDto>): TimingTeamDto => ({
    competitionMatchTeam: overrides.competitionMatchTeam ?? crypto.randomUUID(),
    participantNames: [],
    matchPhase: 'OPEN',
    ...overrides,
})

describe('orderTeamsForBoard', () => {
    test('puts teams of active matches first, finished matches last', () => {
        const done = team({competitionMatchTeam: 'done', matchPhase: 'DONE', startNumber: 1})
        const open = team({competitionMatchTeam: 'open', matchPhase: 'OPEN', startNumber: 2})
        const active = team({competitionMatchTeam: 'active', matchPhase: 'ACTIVE', startNumber: 3})

        const ordered = orderTeamsForBoard([done, open, active])

        expect(ordered.map(t => t.competitionMatchTeam)).toEqual(['active', 'open', 'done'])
    })

    test('sorts by start number within a phase, missing numbers last', () => {
        const ordered = orderTeamsForBoard([
            team({competitionMatchTeam: 'none', matchPhase: 'ACTIVE'}),
            team({competitionMatchTeam: 'two', matchPhase: 'ACTIVE', startNumber: 2}),
            team({competitionMatchTeam: 'one', matchPhase: 'ACTIVE', startNumber: 1}),
        ])

        expect(ordered.map(t => t.competitionMatchTeam)).toEqual(['one', 'two', 'none'])
    })

    test('does not mutate the input', () => {
        const input = [
            team({matchPhase: 'DONE', startNumber: 1}),
            team({matchPhase: 'ACTIVE', startNumber: 2}),
        ]
        const before = [...input]

        orderTeamsForBoard(input)

        expect(input).toEqual(before)
    })
})
