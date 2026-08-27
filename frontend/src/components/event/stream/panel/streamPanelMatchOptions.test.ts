import {describe, expect, it} from 'vitest'
import {matchOptionLabel} from './streamPanelMatchOptions'

describe('matchOptionLabel', () => {
    it('reiht Wettkampf, Runde und Lauf aneinander', () => {
        expect(
            matchOptionLabel(
                {competitionName: '12 JM4x', roundName: 'Vorlauf', matchName: '3'},
                null,
            ),
        ).toBe('12 JM4x Vorlauf 3')
    })

    it('lässt fehlende Runde/Lauf einfach weg, statt eine Lücke zu zeigen', () => {
        expect(matchOptionLabel({competitionName: '12 JM4x', roundName: null}, null)).toBe(
            '12 JM4x',
        )
    })

    it('stellt eine vorformatierte Zeit voran, getrennt durch einen senkrechten Strich', () => {
        expect(
            matchOptionLabel(
                {competitionName: '12 JM4x', roundName: 'Vorlauf', matchName: '3'},
                '10:30',
            ),
        ).toBe('10:30 | 12 JM4x Vorlauf 3')
    })

    it('ohne Zeit entfällt der Strich vollständig', () => {
        expect(matchOptionLabel({competitionName: '12 JM4x'}, null)).toBe('12 JM4x')
    })
})
