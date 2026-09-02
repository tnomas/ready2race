import {describe, expect, it} from 'vitest'
import {AthleteBoardMatch, BoardSequenceDto} from '@api/types.gen.ts'
import {sequenceClockArgs, sequenceForMatch, sequenceLineFor} from './boardSequence.ts'

const match = (overrides: Partial<AthleteBoardMatch> = {}): AthleteBoardMatch =>
    ({
        matchId: 'm1',
        competitionName: 'JM4x',
        categoryName: null,
        roundName: null,
        matchName: null,
        startTime: '2026-09-02T10:00:00',
        state: 'PREPARING',
        startState: 'ON_TIME',
        teams: [],
        ...overrides,
    }) as unknown as AthleteBoardMatch

const running: BoardSequenceDto = {
    sequenceId: 's1',
    state: 'RUNNING',
    startedAt: '2026-09-02T10:00:00',
    firesAt: '2026-09-02T10:00:20',
    pausedAt: null,
    matchIds: ['m1'],
}
const fireMs = new Date('2026-09-02T10:00:20').getTime()

describe('sequenceForMatch / sequenceClockArgs', () => {
    it('hands the sequence only to matches that are in it', () => {
        expect(sequenceForMatch({sequence: running}, 'm1')).toBe(running)
        expect(sequenceForMatch({sequence: running}, 'other')).toBeNull()
        expect(sequenceForMatch({sequence: null}, 'm1')).toBeNull()
    })

    it('gives the clock its three anchors, or nothing', () => {
        expect(sequenceClockArgs({sequence: running}, match())).toEqual({
            startedAt: '2026-09-02T10:00:00',
            firesAt: '2026-09-02T10:00:20',
            pausedAt: null,
        })
        expect(sequenceClockArgs({sequence: running}, match({matchId: 'other'}))).toEqual({
            startedAt: null,
            firesAt: null,
            pausedAt: null,
        })
        expect(sequenceClockArgs({sequence: running}, null).firesAt).toBeNull()
    })
})

describe('sequenceLineFor', () => {
    it('says armed while nothing fires yet', () => {
        expect(
            sequenceLineFor(
                {...running, state: 'ARMED', startedAt: null, firesAt: null},
                match(),
                fireMs,
            ),
        ).toEqual({kind: 'armed'})
    })

    it('counts down to the fire time on the server clock and clamps at zero', () => {
        expect(sequenceLineFor(running, match(), fireMs - 7_000)).toEqual({
            kind: 'countdown',
            remainingMs: 7_000,
            paused: false,
        })
        expect(sequenceLineFor(running, match(), fireMs + 3_000)).toEqual({
            kind: 'countdown',
            remainingMs: 0,
            paused: false,
        })
    })

    it('freezes at the pause start', () => {
        const paused: BoardSequenceDto = {
            ...running,
            state: 'PAUSED',
            pausedAt: '2026-09-02T10:00:15',
        }
        expect(sequenceLineFor(paused, match(), fireMs + 60_000)).toEqual({
            kind: 'countdown',
            remainingMs: 5_000,
            paused: true,
        })
    })

    it('is silent once the match has its own start, for foreign matches, and without a fire time', () => {
        expect(
            sequenceLineFor(running, match({actualStartTime: '2026-09-02T10:00:21'}), fireMs),
        ).toBeNull()
        expect(sequenceLineFor(running, match({matchId: 'other'}), fireMs)).toBeNull()
        expect(sequenceLineFor({...running, firesAt: null}, match(), fireMs)).toBeNull()
        expect(sequenceLineFor(null, match(), fireMs)).toBeNull()
    })
})
