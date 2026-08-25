import {describe, expect, it} from 'vitest'
import {TimingProfileCompetitionDto, TimingProfileOptionDto} from '@api/types.gen.ts'
import {
    awaitReload,
    deviationCount,
    lockRow,
    optionLabel,
    profileLabel,
    releaseCovered,
    toggleExpanded,
    unlockRow,
    WRITE_IN_FLIGHT,
} from './timingProfileTree.ts'

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

/**
 * Der Sperr-Lebenszyklus. Die vier Fälle, die eine Zeile durchlaufen kann — der letzte ist der,
 * an dem die erste Fassung brach: Sie löste bei jeder Baum-Antwort ALLE Sperren.
 */
describe('Sperr-Lebenszyklus', () => {
    it('Fall 1 — der Schreibvorgang scheitert: die Zeile wird sofort gelöst', () => {
        const gesperrt = lockRow(new Map(), 'A')
        expect(gesperrt.get('A')).toBe(WRITE_IN_FLIGHT)
        expect([...unlockRow(gesperrt, 'A')]).toEqual([])
    })

    it('Fall 2 — Schreiben und Laden gelingen: der eigene Baum löst die Zeile', () => {
        const rows = awaitReload(lockRow(new Map(), 'A'), 'A', 1)
        expect(rows.get('A')).toBe(1)
        expect([...releaseCovered(rows, 1)]).toEqual([])
    })

    it('Fall 3 — eine Ladung fällt aus: die nächste löst die übersprungene Zeile mit', () => {
        // Scheitert oder verfällt der Baum mit Stempel 1, bleibt A gesperrt — bis irgendein
        // späterer Baum kommt. Keine Zeile bleibt dauerhaft gesperrt.
        let rows = awaitReload(lockRow(new Map(), 'A'), 'A', 1)
        rows = awaitReload(lockRow(rows, 'B'), 'B', 2)
        expect([...releaseCovered(rows, 2)]).toEqual([])
    })

    it('Fall 4 — zwei Zeilen überlappen: der Baum löst nur, was er enthält', () => {
        // A ist geschrieben und wartet auf Baum 1; B schreibt noch. Baum 1 kennt B nicht.
        const rows = lockRow(awaitReload(lockRow(new Map(), 'A'), 'A', 1), 'B')
        expect([...releaseCovered(rows, 1)]).toEqual([['B', WRITE_IN_FLIGHT]])
    })

    it('Fall 4b — eine Zeile, die auf einen späteren Baum wartet, bleibt gesperrt', () => {
        let rows = awaitReload(lockRow(new Map(), 'A'), 'A', 1)
        rows = awaitReload(lockRow(rows, 'B'), 'B', 2)
        expect([...releaseCovered(rows, 1)]).toEqual([['B', 2]])
    })

    // Ohne diese Regel löste jeder Abruf einen zusätzlichen Rendervorgang aus.
    it('gibt dieselbe Instanz zurück, wenn nichts zu lösen ist', () => {
        const rows = lockRow(new Map(), 'A')
        expect(releaseCovered(rows, 5)).toBe(rows)
    })

    it('lässt die übergebene Karte unangetastet', () => {
        const vorher = awaitReload(new Map(), 'A', 1)
        releaseCovered(vorher, 1)
        unlockRow(vorher, 'A')
        lockRow(vorher, 'B')
        expect([...vorher]).toEqual([['A', 1]])
    })
})
