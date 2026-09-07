// @vitest-environment jsdom
import {act, render} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {AthleteBoardMatch, AthleteBoardTeam} from '@api/types.gen'
import StreamClock from './StreamClock.tsx'

vi.mock('react-i18next', () => ({useTranslation: () => ({t: (key: string) => key})}))

const START = Date.parse('2026-08-13T10:00:00.000Z')

const team = (overrides: Partial<AthleteBoardTeam>): AthleteBoardTeam =>
    ({startNumber: 1, timeString: null, failed: false, ...overrides}) as AthleteBoardTeam

const matchWith = (teams: AthleteBoardTeam[]): AthleteBoardMatch =>
    ({
        matchId: 'match-1',
        competitionName: 'Achter',
        matchName: 'VF1',
        teams,
        actualStartTime: new Date(START).toISOString(),
    }) as AthleteBoardMatch

const clock = (match: AthleteBoardMatch) => <StreamClock match={match} clockOffsetMs={0} size="NORMAL" />

describe('StreamClock', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(START + 400_000)
    })
    afterEach(() => {
        vi.useRealTimers()
    })

    it('zeigt eine korrigierte Zielzeit an, statt auf dem ersten eingefrorenen Wert zu bleiben', () => {
        const {container, rerender} = render(clock(matchWith([team({timeString: '6:06.8'})])))
        act(() => {
            vi.advanceTimersByTime(250)
        })
        expect(container.textContent).toContain('6:06.8')

        rerender(clock(matchWith([team({timeString: '6:10.0'})])))
        act(() => {
            vi.advanceTimersByTime(250)
        })
        expect(container.textContent).toContain('6:10.0')
        expect(container.textContent).not.toContain('6:06.8')
    })

    it('hält den Rückfallwert (keine parsebare Zeit) fest, statt ihn weiterlaufen zu lassen', () => {
        const {container} = render(clock(matchWith([team({failed: true})])))
        act(() => {
            vi.advanceTimersByTime(250)
        })
        expect(container.textContent).toContain('6:40.')

        act(() => {
            vi.advanceTimersByTime(3_000)
        })
        expect(container.textContent).toContain('6:40.')
    })

    it('friert nach einem Zwischenspiel als laufende Uhr auf dem NEUEN Rückfallwert ein', () => {
        const {container, rerender} = render(clock(matchWith([team({failed: true})])))
        act(() => {
            vi.advanceTimersByTime(250)
        })
        expect(container.textContent).toContain('6:40.')

        rerender(clock(matchWith([team({failed: false})])))
        act(() => {
            vi.advanceTimersByTime(10_000)
        })
        expect(container.textContent).toContain('6:50.')

        rerender(clock(matchWith([team({failed: true})])))
        act(() => {
            vi.advanceTimersByTime(250)
        })
        expect(container.textContent).toContain('6:50.')
    })
})
