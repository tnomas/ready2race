import {describe, expect, it} from 'vitest'
import {
    formatDuration,
    formatOfficialTime,
    truncateToPrecision,
} from './format.ts'

// Die Genauigkeits-Grenze der Anzeige: offizielle Zeiten folgen der Veranstaltungs-Einstellung
// (abgeschnitten, nie aufgerundet), Rohwerte bleiben millisekundenfein — siehe format.ts.

describe('truncateToPrecision', () => {
    it('schneidet auf jede der vier Stufen ab', () => {
        expect(truncateToPrecision(91_578, 'SEKUNDE')).toBe(91_000)
        expect(truncateToPrecision(91_578, 'ZEHNTEL')).toBe(91_500)
        expect(truncateToPrecision(91_578, 'HUNDERTSTEL')).toBe(91_570)
        expect(truncateToPrecision(91_578, 'MILLISEKUNDE')).toBe(91_578)
    })

    it('rundet nie kaufmännisch auf', () => {
        // 91_999 → kaufmännisch wäre 92_000 bzw. 92.0: die veröffentlichte Zeit wäre schneller
        // als die gemessene.
        expect(truncateToPrecision(91_999, 'SEKUNDE')).toBe(91_000)
        expect(truncateToPrecision(91_999, 'ZEHNTEL')).toBe(91_900)
    })

    it('Randfall unter einer Sekunde (999 ms)', () => {
        expect(truncateToPrecision(999, 'SEKUNDE')).toBe(0)
        expect(truncateToPrecision(999, 'ZEHNTEL')).toBe(900)
        expect(truncateToPrecision(999, 'HUNDERTSTEL')).toBe(990)
        expect(truncateToPrecision(999, 'MILLISEKUNDE')).toBe(999)
    })

    it('macht zwei Boote 40 ms auseinander bei ZEHNTEL ehrlich zeitgleich', () => {
        expect(truncateToPrecision(91_510, 'ZEHNTEL')).toBe(truncateToPrecision(91_550, 'ZEHNTEL'))
    })
})

describe('formatOfficialTime', () => {
    it('zeigt genau die Stellen der Stufe', () => {
        expect(formatOfficialTime(91_544, 'SEKUNDE')).toBe('1:31')
        expect(formatOfficialTime(91_544, 'ZEHNTEL')).toBe('1:31.5')
        expect(formatOfficialTime(91_544, 'HUNDERTSTEL')).toBe('1:31.54')
        expect(formatOfficialTime(91_544, 'MILLISEKUNDE')).toBe('1:31.544')
    })

    it('polstert die Nachkommastellen führend auf', () => {
        // 91_044: die Zehntel-Stelle ist 0 — "1:31.0", nicht "1:31." oder "1:31.44".
        expect(formatOfficialTime(91_044, 'ZEHNTEL')).toBe('1:31.0')
        expect(formatOfficialTime(90_007, 'HUNDERTSTEL')).toBe('1:30.00')
    })

    it('weitet ab einer Stunde auf h:mm:ss', () => {
        expect(formatOfficialTime(3_695_544, 'ZEHNTEL')).toBe('1:01:35.5')
        expect(formatOfficialTime(3_695_544, 'SEKUNDE')).toBe('1:01:35')
    })
})

describe('formatDuration (Rohwerte)', () => {
    it('bleibt millisekundenfein', () => {
        expect(formatDuration(91_544)).toBe('1:31.544')
        expect(formatDuration(5)).toBe('0:00.005')
    })

    it('behält das Vorzeichen einer kaputten Berechnung', () => {
        expect(formatDuration(-1_500)).toBe('-0:01.500')
    })
})
