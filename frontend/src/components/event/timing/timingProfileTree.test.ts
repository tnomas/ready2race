import {describe, expect, it} from 'vitest'
import {TimingProfileCompetitionDto, TimingProfileOptionDto} from '@api/types.gen.ts'
import {deviationCount, optionLabel, profileLabel, toggleExpanded} from './timingProfileTree.ts'

const optionen: TimingProfileOptionDto[] = [
    {id: 'a', name: 'Timetrial 30s', detail: 'Intervall 30 s'},
    {id: 'b', name: 'Wellenstart', detail: 'WELLE'},
]

const wettkampf = (
    overrides: Partial<TimingProfileCompetitionDto> = {},
): TimingProfileCompetitionDto => ({
    competitionId: 'c1',
    identifier: '12',
    name: 'JM4x',
    ownProfile: null,
    effectiveProfile: null,
    rounds: [],
    ...overrides,
})

describe('optionLabel', () => {
    it('hängt das Detail in Klammern an', () => {
        expect(optionLabel(optionen[0])).toBe('Timetrial 30s (Intervall 30 s)')
    })

    it('lässt die Klammer weg, wenn es kein Detail gibt', () => {
        expect(optionLabel({id: 'c', name: 'Kurzstrecke', detail: null})).toBe('Kurzstrecke')
    })
})

describe('profileLabel', () => {
    it('findet den Namen zur id', () => {
        expect(profileLabel(optionen, 'b')).toBe('Wellenstart (WELLE)')
    })

    it('ohne id gibt es nichts zu zeigen', () => {
        expect(profileLabel(optionen, null)).toBeNull()
    })

    // Ein gelöschtes Profil darf die Zeile nicht zum Absturz bringen.
    it('unbekannte id ergibt null', () => {
        expect(profileLabel(optionen, 'weg')).toBeNull()
    })
})

describe('deviationCount', () => {
    it('zählt eigene Werte unterhalb des Wettkampfs', () => {
        const c = wettkampf({
            rounds: [
                {
                    roundId: 'r1',
                    name: 'Vorlauf',
                    ownProfile: 'a',
                    effectiveProfile: 'a',
                    matches: [
                        {matchId: 'm1', name: 'Lauf 1', ownProfile: 'b', effectiveProfile: 'b'},
                        {matchId: 'm2', name: 'Lauf 2', ownProfile: null, effectiveProfile: 'a'},
                    ],
                },
            ],
        })
        expect(deviationCount(c)).toBe(2)
    })

    it('erbt alles, zählt nichts', () => {
        expect(deviationCount(wettkampf())).toBe(0)
    })

    // Der eigene Wert des Wettkampfs ist keine Abweichung UNTERHALB des Wettkampfs.
    it('der eigene Wert des Wettkampfs zählt nicht mit', () => {
        expect(deviationCount(wettkampf({ownProfile: 'a'}))).toBe(0)
    })
})

describe('toggleExpanded', () => {
    it('klappt eine zugeklappte Ebene auf', () => {
        expect([...toggleExpanded(new Set(['c1']), 'r1')]).toEqual(['c1', 'r1'])
    })

    it('klappt eine aufgeklappte Ebene wieder zu', () => {
        expect([...toggleExpanded(new Set(['c1', 'r1']), 'r1')]).toEqual(['c1'])
    })

    // Die Menge im State darf nicht in place verändert werden, sonst rendert React nicht neu.
    it('lässt die übergebene Menge unangetastet', () => {
        const vorher = new Set(['c1'])
        toggleExpanded(vorher, 'r1')
        expect([...vorher]).toEqual(['c1'])
    })
})
