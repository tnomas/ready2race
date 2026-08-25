import {describe, expect, it} from 'vitest'
import {TimingMatchDto, TimingSequenceDto} from '@api/types.gen.ts'
import {lastMarkByStation, recentlyActiveMatches, sequenceProgress} from './overviewData.ts'

function match(id: string, teamIds: string[], overrides: Partial<TimingMatchDto> = {}): TimingMatchDto {
    return {
        competitionSetupMatch: id,
        competition: `comp-${id}`,
        round: `round-${id}`,
        phase: 'OPEN',
        progress: 'OPEN',
        teams: teamIds.map((teamId, index) => ({
            competitionMatchTeam: teamId,
            startNumber: index + 1,
            started: false,
            finished: false,
        })),
        ...overrides,
    }
}

function mark(station: string, team: string | undefined, timestampMillis: number, status = 'ACTIVE') {
    return {station, assignedTeam: team, timestampMillis, status}
}

describe('recentlyActiveMatches', () => {
    it('sortiert nach der jüngsten zugeordneten aktiven Marke', () => {
        const matches = [match('a', ['t1']), match('b', ['t2'])]
        const marks = [mark('s', 't1', 1000), mark('s', 't2', 2000)]

        const result = recentlyActiveMatches(matches, marks, 10)

        expect(result.map(entry => entry.match.competitionSetupMatch)).toEqual(['b', 'a'])
        expect(result[0].lastActivityMillis).toBe(2000)
    })

    it('lässt Läufe ohne jede Aktivität weg', () => {
        const matches = [match('a', ['t1']), match('b', ['t2'])]
        const marks = [mark('s', 't1', 1000)]

        const result = recentlyActiveMatches(matches, marks, 10)

        expect(result.map(entry => entry.match.competitionSetupMatch)).toEqual(['a'])
    })

    it('ignoriert zurückgenommene und unzugeordnete Marken', () => {
        const matches = [match('a', ['t1'])]
        const marks = [mark('s', 't1', 1000, 'RETRACTED'), mark('s', undefined, 5000)]

        expect(recentlyActiveMatches(matches, marks, 10)).toEqual([])
    })

    it('zählt einen von Hand gestarteten Lauf über seinen Ist-Start', () => {
        const startedAt = new Date(4000).toISOString()
        const matches = [match('a', ['t1'], {startedAt})]

        const result = recentlyActiveMatches(matches, [], 10)

        expect(result).toHaveLength(1)
        expect(result[0].lastActivityMillis).toBe(4000)
    })

    it('begrenzt die Liste', () => {
        const matches = [match('a', ['t1']), match('b', ['t2']), match('c', ['t3'])]
        const marks = [mark('s', 't1', 1), mark('s', 't2', 2), mark('s', 't3', 3)]

        expect(recentlyActiveMatches(matches, marks, 2)).toHaveLength(2)
    })
})

describe('lastMarkByStation', () => {
    it('liefert den spätesten Eingang je Posten, auch für zurückgenommene Marken', () => {
        const marks = [
            mark('s1', 't1', 1000),
            mark('s1', undefined, 3000, 'RETRACTED'),
            mark('s2', 't2', 2000),
        ]

        const latest = lastMarkByStation(marks)

        expect(latest.get('s1')).toBe(3000)
        expect(latest.get('s2')).toBe(2000)
    })
})

describe('sequenceProgress', () => {
    it('zählt gestartete gegen nicht übersprungene Einträge', () => {
        const sequence = {
            entries: [
                {status: 'STARTED'},
                {status: 'STARTED'},
                {status: 'PENDING'},
                {status: 'SKIPPED'},
            ],
        } as unknown as TimingSequenceDto

        expect(sequenceProgress(sequence)).toEqual({started: 2, total: 3})
    })
})
