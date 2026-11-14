import {describe, expect, test} from 'vitest'
import {roundMatchLabel} from './roundMatchLabel.ts'

describe('roundMatchLabel', () => {
    test('Laufname mit Rundennamen darin: nur der Laufname', () => {
        expect(roundMatchLabel('Vorlauf', 'Vorlauf 1')).toBe('Vorlauf 1')
        expect(roundMatchLabel('Vorlauf', 'vorlauf 2')).toBe('vorlauf 2')
    })

    test('gleiche Namen erscheinen einmal', () => {
        expect(roundMatchLabel('Finale', 'Finale')).toBe('Finale')
        expect(roundMatchLabel(' Finale ', 'Finale')).toBe('Finale')
    })

    test('verschiedene Namen: Runde · Lauf', () => {
        expect(roundMatchLabel('Finale', 'A')).toBe('Finale · A')
        expect(roundMatchLabel('Hoffnungslauf', 'Lauf 2')).toBe('Hoffnungslauf · Lauf 2')
    })

    test('fehlt ein Teil, steht der andere allein', () => {
        expect(roundMatchLabel(undefined, 'Lauf 2')).toBe('Lauf 2')
        expect(roundMatchLabel('Finale', null)).toBe('Finale')
        expect(roundMatchLabel(undefined, undefined)).toBe('')
    })
})
