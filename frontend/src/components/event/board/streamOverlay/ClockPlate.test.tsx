// @vitest-environment jsdom
import {render} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {AthleteBoardMatch, AthleteBoardTeam} from '@api/types.gen.ts'
import ClockPlate from './ClockPlate.tsx'

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

describe('ClockPlate', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(START + 400_000)
    })
    afterEach(() => {
        vi.useRealTimers()
    })

    it('zeigt eine korrigierte Zielzeit an, statt auf dem ersten eingefrorenen Wert zu bleiben', () => {
        const {container, rerender} = render(
            <ClockPlate match={matchWith([team({timeString: '6:06.8'})])} clockOffsetMs={0} />,
        )
        expect(container.textContent).toBe('6:06.8')

        rerender(<ClockPlate match={matchWith([team({timeString: '6:10.0'})])} clockOffsetMs={0} />)
        expect(container.textContent).toBe('6:10.0')
    })

    it('hält den Rückfallwert (keine parsebare Zeit) fest, statt ihn weiterlaufen zu lassen', () => {
        const {container, rerender} = render(
            <ClockPlate match={matchWith([team({failed: true})])} clockOffsetMs={0} />,
        )
        expect(container.textContent).toBe('6:40.0')

        vi.setSystemTime(START + 403_000)
        rerender(<ClockPlate match={matchWith([team({failed: true})])} clockOffsetMs={0} />)
        expect(container.textContent).toBe('6:40.0')
    })
})
