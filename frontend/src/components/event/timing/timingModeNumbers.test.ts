import {describe, expect, it} from 'vitest'
import {validateModeNumbers} from './timingModeNumbers.ts'

describe('validateModeNumbers', () => {
    it('übernimmt ganze Sekunden unverändert', () => {
        expect(validateModeNumbers('30', '10')).toEqual({
            ok: true,
            intervalSeconds: 30,
            leadInSeconds: 10,
        })
    })

    it('liest ein leeres Intervall als „jeder Start von Hand"', () => {
        expect(validateModeNumbers('', '10')).toEqual({
            ok: true,
            intervalSeconds: null,
            leadInSeconds: 10,
        })
    })

    it('lässt Leerraum um die Zahl zu', () => {
        expect(validateModeNumbers(' 20 ', ' 5 ')).toEqual({
            ok: true,
            intervalSeconds: 20,
            leadInSeconds: 5,
        })
    })

    it('rundet ein Intervall mit Nachkommastellen nicht still ab', () => {
        // 1,5 wurde bislang zu 1 - der Server bekam etwas anderes, als eingetippt stand.
        expect(validateModeNumbers('1.5', '10')).toEqual({ok: false, field: 'interval'})
    })

    it('lehnt ein Intervall unter einer Sekunde ab', () => {
        expect(validateModeNumbers('0', '10')).toEqual({ok: false, field: 'interval'})
    })

    it('lehnt ein Intervall ab, das keine Zahl ist', () => {
        expect(validateModeNumbers('abc', '10')).toEqual({ok: false, field: 'interval'})
    })

    it('lehnt einen leeren Vorlauf ab statt ihn als 0 zu lesen', () => {
        expect(validateModeNumbers('30', '')).toEqual({ok: false, field: 'leadIn'})
    })

    it('rundet einen Vorlauf mit Nachkommastellen nicht still ab', () => {
        expect(validateModeNumbers('30', '2.5')).toEqual({ok: false, field: 'leadIn'})
    })

    it('lehnt einen negativen Vorlauf ab', () => {
        expect(validateModeNumbers('30', '-1')).toEqual({ok: false, field: 'leadIn'})
    })

    it('erlaubt den Vorlauf 0', () => {
        expect(validateModeNumbers('', '0')).toEqual({
            ok: true,
            intervalSeconds: null,
            leadInSeconds: 0,
        })
    })

    it('meldet das Intervall vor dem Vorlauf, wenn beide falsch sind', () => {
        expect(validateModeNumbers('x', '')).toEqual({ok: false, field: 'interval'})
    })
})
