import {describe, expect, it} from 'vitest'
import {TimingMatchDto, TimingMatchTeamDto} from '@api/types.gen.ts'
import {BoardMark} from '@components/timing/useTimingBoardState.ts'
import {groupMarksByMatch} from './markGrouping.ts'
import {dayScheduleStatus} from './matchBoard.ts'

const team = (
    id: string,
    startNumber: number,
    overrides: Partial<TimingMatchTeamDto> = {},
): TimingMatchTeamDto => ({
    competitionMatchTeam: id,
    startNumber,
    started: false,
    finished: false,
    ...overrides,
})

const match = (
    id: string,
    teams: TimingMatchTeamDto[],
    overrides: Partial<TimingMatchDto> = {},
): TimingMatchDto => ({
    competitionSetupMatch: id,
    competition: 'comp-1',
    round: 'round-1',
    phase: 'ACTIVE',
    progress: 'STARTED',
    teams,
    ...overrides,
})

const mark = (
    id: string,
    timestampMillis: number,
    overrides: Partial<BoardMark> = {},
): BoardMark => ({
    id,
    event: 'event-1',
    station: 'station-1',
    timestampMillis,
    source: 'APP_USER',
    status: 'ACTIVE',
    ...overrides,
})

describe('groupMarksByMatch', () => {
    const matches = [
        match('m1', [team('t1', 1), team('t2', 2)]),
        match('m2', [team('t3', 1)]),
    ]

    it('gruppiert Marken über ihr zugeordnetes Boot zur Partie', () => {
        const groups = groupMarksByMatch(
            [
                mark('a', 1000, {assignedTeam: 't1'}),
                mark('b', 2000, {assignedTeam: 't3'}),
                mark('c', 3000, {assignedTeam: 't2'}),
            ],
            matches,
        )

        expect(groups.map(g => g.match?.competitionSetupMatch)).toEqual(['m1', 'm2'])
        expect(groups[0].marks.map(m => m.id)).toEqual(['c', 'a'])
        expect(groups[1].marks.map(m => m.id)).toEqual(['b'])
    })

    it('ordnet die Gruppen nach ihrer jüngsten Marke, jüngste zuerst', () => {
        // Die Liste liest sich wie bisher von oben (neu) nach unten (alt) — nur eben in
        // Partie-Blöcken: die Partie mit dem frischesten Stempel steht oben.
        const groups = groupMarksByMatch(
            [mark('alt', 1000, {assignedTeam: 't1'}), mark('neu', 9000, {assignedTeam: 't3'})],
            matches,
        )

        expect(groups.map(g => g.match?.competitionSetupMatch)).toEqual(['m2', 'm1'])
    })

    it('sammelt unzugeordnete und unbekannte Marken in einer eigenen Gruppe ohne Partie', () => {
        const groups = groupMarksByMatch(
            [
                mark('frei', 5000),
                mark('fremd', 6000, {assignedTeam: 'unbekanntes-team'}),
                mark('zugeordnet', 1000, {assignedTeam: 't1'}),
            ],
            matches,
        )

        const loose = groups.find(g => g.match === undefined)
        expect(loose?.marks.map(m => m.id)).toEqual(['fremd', 'frei'])
        expect(groups.find(g => g.match?.competitionSetupMatch === 'm1')).toBeDefined()
    })

    it('liefert ohne Partien eine einzige Gruppe ohne Partie', () => {
        const groups = groupMarksByMatch([mark('a', 1000), mark('b', 2000)], [])

        expect(groups).toHaveLength(1)
        expect(groups[0].match).toBeUndefined()
        expect(groups[0].marks.map(m => m.id)).toEqual(['b', 'a'])
    })

    it('liefert für eine leere Markenliste keine Gruppen', () => {
        expect(groupMarksByMatch([], matches)).toEqual([])
    })
})

describe('dayScheduleStatus', () => {
    it('meldet eine offene Partie als offen', () => {
        const status = dayScheduleStatus(match('m1', [team('t1', 1)], {progress: 'OPEN'}))
        expect(status.kind).toBe('OPEN')
    })

    it('meldet eine laufende Startsequenz', () => {
        const status = dayScheduleStatus(match('m1', [team('t1', 1)], {progress: 'STARTING'}))
        expect(status.kind).toBe('STARTING')
    })

    it('zählt bei einer gestarteten Partie die Boote im Ziel', () => {
        const status = dayScheduleStatus(
            match(
                'm1',
                [team('t1', 1, {finished: true}), team('t2', 2), team('t3', 3)],
                {progress: 'STARTED'},
            ),
        )
        expect(status).toEqual({kind: 'STARTED', finished: 1, total: 3})
    })

    it('meldet eine beendete Partie als fertig', () => {
        const status = dayScheduleStatus(
            match('m1', [team('t1', 1, {finished: true})], {progress: 'FINISHED'}),
        )
        expect(status.kind).toBe('FINISHED')
    })
})
