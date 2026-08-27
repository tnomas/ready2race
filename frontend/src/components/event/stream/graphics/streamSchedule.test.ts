import {describe, expect, it} from 'vitest'
import {AthleteBoardMatch} from '@api/types.gen'
import {MAX_SCHEDULE_ROWS, scheduleRows} from './streamSchedule'

const matchStub = (matchId: string): AthleteBoardMatch => ({
    matchId,
    competitionName: 'Wettkampf',
    state: 'PREPARING',
    startState: 'SCHEDULED',
    teams: [],
    pendingRound: false,
    cancelled: false,
})

describe('scheduleRows', () => {
    it('liefert ein leeres Array für null/undefined statt zu werfen', () => {
        expect(scheduleRows(null)).toEqual([])
        expect(scheduleRows(undefined)).toEqual([])
    })

    it('gibt eine bereits kurze Liste unverändert weiter', () => {
        const matches = [matchStub('a'), matchStub('b')]
        expect(scheduleRows(matches)).toEqual(matches)
    })

    it('deckelt eine zu lange Liste defensiv auf MAX_SCHEDULE_ROWS', () => {
        const matches = Array.from({length: MAX_SCHEDULE_ROWS + 5}, (_, i) => matchStub(String(i)))
        const rows = scheduleRows(matches)
        expect(rows).toHaveLength(MAX_SCHEDULE_ROWS)
        expect(rows).toEqual(matches.slice(0, MAX_SCHEDULE_ROWS))
    })
})
