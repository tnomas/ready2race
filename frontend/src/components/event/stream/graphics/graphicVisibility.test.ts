import {describe, expect, it} from 'vitest'
import {GRAPHIC_TRANSITION_MS, visibilityPhase} from './graphicVisibility'

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
