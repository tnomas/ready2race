// @vitest-environment jsdom
import {act, renderHook} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {AthleteBoardMatch, AthleteBoardTeam} from '@api/types.gen.ts'
import useStreamClockDisplay from './useStreamClockDisplay.ts'

const START = Date.parse('2026-08-13T10:00:00.000Z')

const team = (overrides: Partial<AthleteBoardTeam>): AthleteBoardTeam =>
    ({startNumber: 1, timeString: null, failed: false, ...overrides}) as AthleteBoardTeam

const matchWith = (teams: AthleteBoardTeam[]): AthleteBoardMatch =>
    ({
        matchId: 'match-1',
        matchName: 'VF1',
        teams,
        actualStartTime: new Date(START).toISOString(),
    }) as AthleteBoardMatch

describe('useStreamClockDisplay', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(START + 400_000)
    })
    afterEach(() => {
        vi.useRealTimers()
    })

    it('zeigt eine korrigierte Zielzeit an, statt auf dem ersten eingefrorenen Wert zu bleiben', () => {
        const {result, rerender} = renderHook(({match}: {match: AthleteBoardMatch}) => useStreamClockDisplay(match, 0), {
            initialProps: {match: matchWith([team({timeString: '6:06.8'})])},
        })
        act(() => {
            vi.advanceTimersByTime(100)
        })
        expect(result.current.text).toBe('6:06.8')

        rerender({match: matchWith([team({timeString: '6:10.0'})])})
        act(() => {
            vi.advanceTimersByTime(100)
        })
        expect(result.current.text).toBe('6:10.0')
    })

    it('hält den Rückfallwert (keine parsebare Zeit) fest, statt ihn weiterlaufen zu lassen', () => {
        const {result} = renderHook(() => useStreamClockDisplay(matchWith([team({failed: true})]), 0))
        act(() => {
            vi.advanceTimersByTime(100)
        })
        const first = result.current.text
        expect(first).toBe('6:40.0')

        act(() => {
            vi.advanceTimersByTime(2_000)
        })
        expect(result.current.text).toBe(first)
    })

    it('läuft wieder, wenn ein Boot seine Zeit verliert, und friert danach auf dem neuen Stand ein', () => {
        const {result, rerender} = renderHook(({match}: {match: AthleteBoardMatch}) => useStreamClockDisplay(match, 0), {
            initialProps: {match: matchWith([team({failed: true})])},
        })
        act(() => {
            vi.advanceTimersByTime(100)
        })
        expect(result.current.text).toBe('6:40.0')

        // Die Wertung wird zurückgenommen: das Boot ist wieder auf dem Wasser.
        rerender({match: matchWith([team({failed: false})])})
        act(() => {
            vi.advanceTimersByTime(10_000)
        })
        expect(result.current.text).toBe('6:50.1')

        // Erneut alle gewertet: der Rückfallwert ist der von JETZT, nicht der alte.
        rerender({match: matchWith([team({failed: true})])})
        act(() => {
            vi.advanceTimersByTime(100)
        })
        expect(result.current.text).toBe('6:50.1')
    })
})
