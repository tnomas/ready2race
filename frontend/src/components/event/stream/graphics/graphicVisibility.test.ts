import {describe, expect, it} from 'vitest'
import {expiredWhileStale, GRAPHIC_TRANSITION_MS, visibilityPhase} from './graphicVisibility'

describe('visibilityPhase', () => {
    it('ist "entering", solange die Animationsdauer seit dem Sichtbarwerden nicht um ist', () => {
        expect(visibilityPhase(true, 1_000, 1_000)).toBe('entering')
        expect(visibilityPhase(true, 1_000, 1_000 + GRAPHIC_TRANSITION_MS - 1)).toBe('entering')
    })

    it('wird "shown", sobald die Animationsdauer erreicht ist', () => {
        expect(visibilityPhase(true, 1_000, 1_000 + GRAPHIC_TRANSITION_MS)).toBe('shown')
        expect(visibilityPhase(true, 1_000, 1_000 + GRAPHIC_TRANSITION_MS * 10)).toBe('shown')
    })

    it('ist "leaving", solange die Animationsdauer seit dem Unsichtbarwerden nicht um ist', () => {
        expect(visibilityPhase(false, 1_000, 1_000)).toBe('leaving')
        expect(visibilityPhase(false, 1_000, 1_000 + GRAPHIC_TRANSITION_MS - 1)).toBe('leaving')
    })

    it('wird "hidden", sobald die Animationsdauer erreicht ist', () => {
        expect(visibilityPhase(false, 1_000, 1_000 + GRAPHIC_TRANSITION_MS)).toBe('hidden')
        expect(visibilityPhase(false, 1_000, 1_000 + GRAPHIC_TRANSITION_MS * 10)).toBe('hidden')
    })
})

describe('expiredWhileStale', () => {
    const until = '2026-08-14T10:00:15Z'
    const untilMs = Date.parse(until)

    it('läuft ohne Störung nie von selbst ab — der Server pusht das Ausblenden', () => {
        expect(expiredWhileStale(false, until, 0, untilMs + 60_000)).toBe(false)
    })

    it('läuft in der Störung ab, sobald das Anzeigefenster laut Serveruhr vorbei ist', () => {
        expect(expiredWhileStale(true, until, 0, untilMs + 1)).toBe(true)
        expect(expiredWhileStale(true, until, 0, untilMs - 1)).toBe(false)
    })

    it('rechnet das Anzeigefenster mit dem Uhrversatz in die Geräteuhr um', () => {
        // Gerät geht 5 s vor (clientNow − serverTime = +5000): das Fenster endet auf dem
        // Gerät erst 5 s später.
        expect(expiredWhileStale(true, until, 5_000, untilMs + 4_000)).toBe(false)
        expect(expiredWhileStale(true, until, 5_000, untilMs + 6_000)).toBe(true)
    })

    it('kennt ohne Anzeigefenster (Uhr, Ticker) kein Ablaufen', () => {
        expect(expiredWhileStale(true, null, 0, Number.MAX_SAFE_INTEGER)).toBe(false)
        expect(expiredWhileStale(true, undefined, 0, Number.MAX_SAFE_INTEGER)).toBe(false)
    })

    it('ignoriert ein unlesbares Fenster', () => {
        expect(expiredWhileStale(true, 'kein Datum', 0, Number.MAX_SAFE_INTEGER)).toBe(false)
    })
})
