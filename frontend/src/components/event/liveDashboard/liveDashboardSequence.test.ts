import {describe, expect, it} from 'vitest'
import {
    LiveDashboardMatchDto,
    LiveDashboardSequenceDto,
    LiveDashboardTeamDto,
} from '@api/types.gen.ts'
import {sequenceProgress, showsFalseStart, teamSequenceMarker} from './liveDashboardSequence.ts'

const team = (overrides: Partial<LiveDashboardTeamDto>): LiveDashboardTeamDto =>
    ({
        teamId: overrides.teamId ?? crypto.randomUUID(),
        clubsShort: 'RCF',
        clubsFull: 'Ruderclub Flensburg',
        failed: false,
        deregistered: false,
        invoiceState: 'NONE',
        severity: 'OK',
        invoiceSeverity: 'OK',
        inArenaRequired: false,
        inArenaSeverity: 'OK',
        substituted: false,
        ...overrides,
    }) as LiveDashboardTeamDto

const match = (
    sequence: LiveDashboardSequenceDto | undefined,
    teams: LiveDashboardTeamDto[],
    overrides: Partial<LiveDashboardMatchDto> = {},
): LiveDashboardMatchDto =>
    ({
        matchId: 'm1',
        state: 'PREPARING',
        competitionId: 'c1',
        competitionName: 'JM4x',
        executionOrder: 1,
        teams,
        sequence,
        ...overrides,
    }) as LiveDashboardMatchDto

const running: LiveDashboardSequenceDto = {sequenceId: 's1', state: 'RUNNING', mode: 'INTERVAL'}

describe('sequenceProgress', () => {
    it('is null without a sequence on the match', () => {
        expect(sequenceProgress(match(undefined, [team({})]))).toBeNull()
    })

    it('counts started boats against the not-skipped field and picks the next pending by position', () => {
        const a = team({
            startNumber: 1,
            sequenceEntry: {position: 0, status: 'STARTED', plannedStartMillis: 1000},
        })
        const skipped = team({
            startNumber: 2,
            sequenceEntry: {position: 1, status: 'SKIPPED', plannedStartMillis: 2000},
        })
        const c = team({
            startNumber: 3,
            sequenceEntry: {position: 3, status: 'PENDING', plannedStartMillis: 4000},
        })
        const b = team({
            startNumber: 4,
            sequenceEntry: {position: 2, status: 'PENDING', plannedStartMillis: 3000},
        })
        const outsider = team({startNumber: 5})

        const progress = sequenceProgress(match(running, [c, a, skipped, b, outsider]))

        expect(progress).not.toBeNull()
        expect(progress?.startedCount).toBe(1)
        expect(progress?.total).toBe(3)
        expect(progress?.next?.teamId).toBe(b.teamId)
        expect(progress?.targetMillis).toBe(3000)
        expect(progress?.frozenRemainingMillis).toBeNull()
    })

    it('has no target while the sequence is only armed', () => {
        const armed: LiveDashboardSequenceDto = {sequenceId: 's1', state: 'ARMED', mode: 'MASS'}
        const progress = sequenceProgress(
            match(armed, [team({sequenceEntry: {position: 0, status: 'PENDING'}})]),
        )
        expect(progress?.next).not.toBeNull()
        expect(progress?.targetMillis).toBeNull()
    })

    it('freezes the remaining time at the pause start', () => {
        const paused: LiveDashboardSequenceDto = {
            sequenceId: 's1',
            state: 'PAUSED',
            mode: 'MASS',
            pausedAtMillis: 9_000,
        }
        const progress = sequenceProgress(
            match(paused, [
                team({sequenceEntry: {position: 0, status: 'PENDING', plannedStartMillis: 15_000}}),
            ]),
        )
        expect(progress?.frozenRemainingMillis).toBe(6_000)
    })

    it('has nothing next once every boat of the match has started', () => {
        const progress = sequenceProgress(
            match(running, [
                team({sequenceEntry: {position: 0, status: 'STARTED', plannedStartMillis: 1000}}),
            ]),
        )
        expect(progress?.next).toBeNull()
        expect(progress?.targetMillis).toBeNull()
        expect(progress?.startedCount).toBe(1)
    })
})

describe('teamSequenceMarker', () => {
    it('is null for boats outside the sequence', () => {
        expect(teamSequenceMarker(team({}), running)).toBeNull()
    })

    it('marks skipped boats regardless of mode', () => {
        expect(
            teamSequenceMarker(team({sequenceEntry: {position: 1, status: 'SKIPPED'}}), {
                sequenceId: 's1',
                state: 'RUNNING',
                mode: 'MASS',
            }),
        ).toEqual({kind: 'skipped'})
    })

    it('shows the planned own start only in a running time trial', () => {
        const pending = team({
            sequenceEntry: {position: 2, status: 'PENDING', plannedStartMillis: 5000},
        })
        expect(teamSequenceMarker(pending, running)).toEqual({kind: 'planned', startMillis: 5000})
        // Wellenstart: alle teilen den Startzeitpunkt, der steht im Streifen.
        expect(teamSequenceMarker(pending, {...running, mode: 'MASS'})).toBeNull()
        // Scharf: noch kein Zeitpunkt.
        expect(teamSequenceMarker(pending, {...running, state: 'ARMED'})).toBeNull()
        // Gestartet: der Ist-Start steht schon in der Zeile.
        expect(
            teamSequenceMarker(
                team({sequenceEntry: {position: 2, status: 'STARTED', plannedStartMillis: 5000}}),
                running,
            ),
        ).toBeNull()
    })
})

describe('showsFalseStart', () => {
    it('shows the recall while the match has no new start', () => {
        expect(showsFalseStart(match(undefined, [], {falseStartAt: '2026-09-02T10:00:00'}))).toBe(
            true,
        )
        expect(
            showsFalseStart(
                match(undefined, [], {
                    falseStartAt: '2026-09-02T10:00:00',
                    startedAt: '2026-09-02T10:05:00',
                }),
            ),
        ).toBe(false)
        expect(showsFalseStart(match(undefined, []))).toBe(false)
    })
})
