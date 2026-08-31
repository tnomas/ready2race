import {describe, expect, it} from 'vitest'
import {TimeMarkDto, TimingMatchDto, TimingSequenceDto, TimingStationDto} from '@api/types.gen.ts'
import {
    buildTimingIndex,
    deriveFinishTicker,
    deriveTeamProgress,
    expireFalseStarts,
    FALSE_START_TTL_MILLIS,
    sequenceOfMatch,
} from './speakerTiming.ts'

const station = (id: string, type: TimingStationDto['type']): TimingStationDto => ({
    id,
    event: 'event-1',
    name: id,
    type,
    sorting: 0,
    captureMode: 'ONETOUCH',
    armed: false,
})

const timingMatch = (matchId: string, teamIds: string[]): TimingMatchDto => ({
    competitionSetupMatch: matchId,
    competition: 'competition-1',
    competitionName: `Wettkampf ${matchId}`,
    round: 'round-1',
    phase: 'ACTIVE',
    progress: 'OPEN',
    teams: teamIds.map((teamId, index) => ({
        competitionMatchTeam: teamId,
        startNumber: index + 1,
        clubName: `Verein ${teamId}`,
        started: false,
        finished: false,
    })),
})

const mark = (
    id: string,
    stationId: string,
    timestampMillis: number,
    assignedTeam?: string,
    status = 'ACTIVE',
): TimeMarkDto => ({
    id,
    event: 'event-1',
    station: stationId,
    timestampMillis,
    source: 'BUTTON',
    status,
    assignedTeam,
})

const sequence = (
    id: string,
    stationId: string,
    state: TimingSequenceDto['state'],
    teamIds: string[],
): TimingSequenceDto => ({
    id,
    event: 'event-1',
    station: stationId,
    mode: 'INTERVAL',
    leadInMillis: 0,
    state,
    entries: teamIds.map((teamId, index) => ({
        id: `${id}-${index}`,
        competitionMatchTeam: teamId,
        position: index,
        status: 'PENDING',
    })),
})

describe('buildTimingIndex', () => {
    it('indexes teams and matches by their ids', () => {
        const index = buildTimingIndex([timingMatch('m1', ['t1', 't2']), timingMatch('m2', ['t3'])])
        expect(index.byMatch.get('m1')?.competitionSetupMatch).toBe('m1')
        expect(index.byTeam.get('t3')?.match.competitionSetupMatch).toBe('m2')
        expect(index.byTeam.get('t2')?.team.startNumber).toBe(2)
    })
})

describe('deriveTeamProgress', () => {
    const stations = [station('start-1', 'START'), station('finish-1', 'FINISH'), station('split-1', 'SPLIT')]

    it('marks a team started for an assigned active mark on a START station', () => {
        const progress = deriveTeamProgress([mark('a', 'start-1', 1000, 't1')], stations)
        expect(progress.get('t1')).toEqual({started: true, finished: false})
    })

    it('marks a team finished for an assigned active mark on a FINISH station', () => {
        const progress = deriveTeamProgress(
            [mark('a', 'start-1', 1000, 't1'), mark('b', 'finish-1', 2000, 't1')],
            stations,
        )
        expect(progress.get('t1')).toEqual({started: true, finished: true})
    })

    it('ignores retracted marks, unassigned marks, and SPLIT stations', () => {
        const progress = deriveTeamProgress(
            [
                mark('a', 'start-1', 1000, 't1', 'RETRACTED'),
                mark('b', 'finish-1', 2000),
                mark('c', 'split-1', 3000, 't2'),
            ],
            stations,
        )
        expect(progress.size).toBe(0)
    })
})

describe('deriveFinishTicker', () => {
    const stations = [station('start-1', 'START'), station('finish-1', 'FINISH')]
    const index = buildTimingIndex([timingMatch('m1', ['t1'])])

    it('lists only active finish marks, newest first, resolving the assigned team', () => {
        const ticker = deriveFinishTicker(
            [
                mark('early', 'finish-1', 1000, 't1'),
                mark('late', 'finish-1', 3000),
                mark('startmark', 'start-1', 4000, 't1'),
                mark('retracted', 'finish-1', 5000, 't1', 'RETRACTED'),
            ],
            stations,
            index,
            10,
        )
        expect(ticker.map(entry => entry.markId)).toEqual(['late', 'early'])
        expect(ticker[0].ref).toBeUndefined()
        expect(ticker[1].ref?.match.competitionSetupMatch).toBe('m1')
    })

    it('caps the list at the limit', () => {
        const marks = [1, 2, 3, 4].map(n => mark(`m${n}`, 'finish-1', n * 1000))
        expect(deriveFinishTicker(marks, stations, index, 2)).toHaveLength(2)
    })
})

describe('expireFalseStarts', () => {
    it('drops events older than the TTL and keeps fresh ones', () => {
        const now = 1_000_000_000
        const events = [
            {matchId: 'old', receivedAtMillis: now - FALSE_START_TTL_MILLIS - 1},
            {matchId: 'fresh', receivedAtMillis: now - 1000},
        ]
        expect(expireFalseStarts(events, now).map(event => event.matchId)).toEqual(['fresh'])
    })
})

describe('sequenceOfMatch', () => {
    const index = buildTimingIndex([timingMatch('m1', ['t1', 't2']), timingMatch('m2', ['t3'])])

    it('finds the armed/running sequence containing a team of the match', () => {
        const sequences = new Map([
            ['start-1', sequence('s1', 'start-1', 'RUNNING', ['t1', 't2'])],
        ])
        expect(sequenceOfMatch(sequences, index, 'm1')?.id).toBe('s1')
        expect(sequenceOfMatch(sequences, index, 'm2')).toBeUndefined()
    })

    it('ignores settled sequences', () => {
        const sequences = new Map([['start-1', sequence('s1', 'start-1', 'DONE', ['t1'])]])
        expect(sequenceOfMatch(sequences, index, 'm1')).toBeUndefined()
    })
})
