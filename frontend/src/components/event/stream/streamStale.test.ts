import {describe, expect, it} from 'vitest'
import {allowsNewlyVisible, isStreamStale, STREAM_STALE_AFTER_MS} from './streamStale'

describe('STREAM_STALE_AFTER_MS', () => {
    it('lässt mindestens zwei Herzschläge des Servers (20 s) aus, bevor die Bühne als veraltet gilt', () => {
        // Ein einzelner verspäteter Herzschlag ist im Betrieb Alltag und darf keine Einblendung
        // sperren — erst zwei ausgebliebene sind ein Zeichen für einen stehenden Kanal.
        expect(STREAM_STALE_AFTER_MS).toBeGreaterThanOrEqual(2 * 20_000)
    })
})

describe('isStreamStale', () => {
    it('gilt nicht als veraltet, solange kein Rahmen kam — das ist der Ladezustand', () => {
        expect(isStreamStale(null, 1_000_000)).toBe(false)
    })

    it('gilt nicht als veraltet, solange die Frist nicht um ist', () => {
        expect(isStreamStale(1_000, 1_000 + STREAM_STALE_AFTER_MS - 1)).toBe(false)
    })

    it('gilt als veraltet, sobald die Frist erreicht ist', () => {
        expect(isStreamStale(1_000, 1_000 + STREAM_STALE_AFTER_MS)).toBe(true)
    })

    it('bleibt veraltet, je länger die Stille dauert', () => {
        expect(isStreamStale(1_000, 1_000 + STREAM_STALE_AFTER_MS * 10)).toBe(true)
    })
})

describe('allowsNewlyVisible', () => {
    it('lässt eine bereits laufende Einblendung stehen, egal ob veraltet', () => {
        expect(allowsNewlyVisible(true, true)).toBe(true)
        expect(allowsNewlyVisible(false, true)).toBe(true)
    })

    it('erlaubt eine neue Einblendung nur, solange die Bühne frisch ist', () => {
        expect(allowsNewlyVisible(false, false)).toBe(true)
    })

    it('unterdrückt eine neue Einblendung während einer Störung', () => {
        expect(allowsNewlyVisible(true, false)).toBe(false)
    })
})
