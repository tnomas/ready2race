import {describe, expect, it} from 'vitest'
import {
    buildOverrideRequest,
    durationChoiceSeconds,
    graphicUsesMatchPicker,
} from './streamPanelOverride'

describe('durationChoiceSeconds', () => {
    it('trägt "bis auf Widerruf" als null — kein Auto-Out', () => {
        expect(durationChoiceSeconds('UNTIL_REVOKED')).toBeNull()
    })

    it('reicht eine gewählte Sekundenzahl unverändert durch', () => {
        expect(durationChoiceSeconds(10)).toBe(10)
        expect(durationChoiceSeconds(20)).toBe(20)
        expect(durationChoiceSeconds(30)).toBe(30)
    })
})

describe('graphicUsesMatchPicker', () => {
    it('nur STARTLIST/RESULT/NEXT_UP bekommen einen Lauf-Wähler', () => {
        expect(graphicUsesMatchPicker('STARTLIST')).toBe(true)
        expect(graphicUsesMatchPicker('RESULT')).toBe(true)
        expect(graphicUsesMatchPicker('NEXT_UP')).toBe(true)
    })

    it('CLOCK/LAPS/FINISH_TICKER/SCHEDULE/COURSE_IMAGE bekommen keinen', () => {
        expect(graphicUsesMatchPicker('CLOCK')).toBe(false)
        expect(graphicUsesMatchPicker('LAPS')).toBe(false)
        expect(graphicUsesMatchPicker('FINISH_TICKER')).toBe(false)
        expect(graphicUsesMatchPicker('SCHEDULE')).toBe(false)
        expect(graphicUsesMatchPicker('COURSE_IMAGE')).toBe(false)
    })
})

describe('buildOverrideRequest', () => {
    it('FORCED_OFF trägt weder Lauf noch Dauer — beides wäre bedeutungslos', () => {
        expect(buildOverrideRequest('FORCED_OFF', 'match-1', 20)).toEqual({state: 'FORCED_OFF'})
        expect(buildOverrideRequest('FORCED_OFF', null, 'UNTIL_REVOKED')).toEqual({
            state: 'FORCED_OFF',
        })
    })

    it('FORCED_ON mit gewähltem Lauf und fester Dauer', () => {
        expect(buildOverrideRequest('FORCED_ON', 'match-1', 20)).toEqual({
            state: 'FORCED_ON',
            match: 'match-1',
            seconds: 20,
        })
    })

    it('FORCED_ON ohne Laufwahl (= aktueller Inhalt) und ohne Auto-Out', () => {
        expect(buildOverrideRequest('FORCED_ON', null, 'UNTIL_REVOKED')).toEqual({
            state: 'FORCED_ON',
            match: null,
            seconds: null,
        })
    })
})
