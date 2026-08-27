import {describe, expect, it} from 'vitest'
import {formatGapMillis, parseResultTimeMillis, winnerGap} from './resultGap'

describe('parseResultTimeMillis', () => {
    it('liest m:ss.d', () => {
        expect(parseResultTimeMillis('1:05.5')).toBe(65_500)
    })

    it('liest ss ohne Minuten', () => {
        expect(parseResultTimeMillis('42')).toBe(42_000)
    })

    it('liest h:mm:ss.ddd', () => {
        expect(parseResultTimeMillis('1:02:03.123')).toBe(3_723_123)
    })

    it('liest ohne Nachkommastellen', () => {
        expect(parseResultTimeMillis('2:00')).toBe(120_000)
    })

    it('liefert null für DNF/DSQ-Text statt eine Zahl zu erfinden', () => {
        expect(parseResultTimeMillis('DNF')).toBeNull()
    })

    it('liefert null für leeren Text', () => {
        expect(parseResultTimeMillis('')).toBeNull()
    })

    it('liefert null für unerwartetes Format', () => {
        expect(parseResultTimeMillis('1:02.3.4')).toBeNull()
        expect(parseResultTimeMillis('1:2:3:4')).toBeNull()
    })
})

describe('formatGapMillis', () => {
    it('formatiert unter einer Minute als "+s,cc"', () => {
        expect(formatGapMillis(860)).toBe('+0,86')
    })

    it('formatiert ab einer Minute als "+m:ss,cc"', () => {
        expect(formatGapMillis(62_340)).toBe('+1:02,34')
    })

    it('formatiert ab einer Stunde als "+h:mm:ss,cc"', () => {
        expect(formatGapMillis(3_723_120)).toBe('+1:02:03,12')
    })

    it('nutzt das übergebene Dezimaltrennzeichen', () => {
        expect(formatGapMillis(860, '.')).toBe('+0.86')
    })

    it('liefert null ohne Rückstand (Sieger oder totes Rennen)', () => {
        expect(formatGapMillis(0)).toBeNull()
    })

    it('liefert null für einen negativen Rückstand statt eine falsche Zahl zu zeigen', () => {
        expect(formatGapMillis(-10)).toBeNull()
    })
})

describe('winnerGap', () => {
    it('berechnet den Rückstand aus zwei Ergebniszeiten', () => {
        expect(winnerGap('1:06.36', '1:05.50')).toBe('+0,86')
    })

    it('liefert null für den Sieger selbst', () => {
        expect(winnerGap('1:05.50', '1:05.50')).toBeNull()
    })

    it('liefert null, wenn eine der beiden Zeiten fehlt', () => {
        expect(winnerGap(null, '1:05.50')).toBeNull()
        expect(winnerGap('1:06.36', undefined)).toBeNull()
    })

    it('liefert null, wenn sich eine Zeile nicht parsen lässt, statt zu raten', () => {
        expect(winnerGap('DNF', '1:05.50')).toBeNull()
    })
})
