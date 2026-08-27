import {describe, expect, it} from 'vitest'
import {isPanelStale, secondsSincePush, STREAM_PANEL_STALE_WARNING_MS} from './streamPanelHealth'

describe('secondsSincePush', () => {
    it('null vor dem allerersten Rahmen — das ist der Ladezustand, keine Störung', () => {
        expect(secondsSincePush(null, 1_000_000)).toBeNull()
    })

    it('rundet auf volle Sekunden ab', () => {
        expect(secondsSincePush(1_000, 1_000 + 4_999)).toBe(4)
        expect(secondsSincePush(1_000, 1_000 + 5_000)).toBe(5)
    })
})

describe('isPanelStale', () => {
    it('gilt nicht als veraltet, solange kein Rahmen kam', () => {
        expect(isPanelStale(null, 1_000_000)).toBe(false)
    })

    it('gilt nicht als veraltet, solange die 30-Sekunden-Frist nicht um ist', () => {
        expect(isPanelStale(1_000, 1_000 + STREAM_PANEL_STALE_WARNING_MS - 1)).toBe(false)
    })

    it('gilt als veraltet, sobald die Frist erreicht ist', () => {
        expect(isPanelStale(1_000, 1_000 + STREAM_PANEL_STALE_WARNING_MS)).toBe(true)
    })

    it('bleibt veraltet, je länger die Stille dauert', () => {
        expect(isPanelStale(1_000, 1_000 + STREAM_PANEL_STALE_WARNING_MS * 10)).toBe(true)
    })
})
