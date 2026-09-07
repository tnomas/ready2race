import {describe, expect, it} from 'vitest'
import {parseBoundedInt} from './boundedInt'

describe('parseBoundedInt', () => {
    it('liest eine ganze Zahl im Bereich unverändert', () => {
        expect(parseBoundedInt('15', 1, 600)).toBe(15)
        expect(parseBoundedInt(' 8 ', 1, 50)).toBe(8)
    })

    it('rundet Dezimalzahlen', () => {
        expect(parseBoundedInt('7.4', 1, 600)).toBe(7)
        expect(parseBoundedInt('7.5', 1, 600)).toBe(8)
        expect(parseBoundedInt('7,5', 1, 600)).toBe(8)
    })

    it('klemmt auf die Grenzen', () => {
        expect(parseBoundedInt('0', 1, 600)).toBe(1)
        expect(parseBoundedInt('-3', 1, 600)).toBe(1)
        expect(parseBoundedInt('9999', 1, 600)).toBe(600)
    })

    it('meldet leer als ungültig statt still eine Vorgabe zu nehmen', () => {
        expect(parseBoundedInt('', 1, 600)).toBeNull()
        expect(parseBoundedInt('   ', 1, 600)).toBeNull()
    })

    it('meldet Unlesbares als ungültig', () => {
        expect(parseBoundedInt('abc', 1, 600)).toBeNull()
        expect(parseBoundedInt('1e', 1, 600)).toBeNull()
        expect(parseBoundedInt('Infinity', 1, 600)).toBeNull()
    })
})
