import {describe, expect, it} from 'vitest'
import {TimingMatchDto, TimingMatchTeamDto} from '@api/types.gen.ts'
import {
    BoatKeyLayout,
    DEFAULT_BOAT_KEYS,
    TimingModeKeys,
    boatKeyHint,
    boatKeyLayout,
    boatKeyRows,
    boatPosition,
    cycleFocus,
    finishKeyTarget,
    resolveFinishFocus,
} from './boardFocus.ts'

const team = (
    startNumber: number,
    overrides: Partial<TimingMatchTeamDto> = {},
): TimingMatchTeamDto => ({
    competitionMatchTeam: `team-${startNumber}`,
    startNumber,
    teamName: `Boot ${startNumber}`,
    started: true,
    finished: false,
    ...overrides,
})

const match = (
    id: string,
    progress: TimingMatchDto['progress'],
    teams: TimingMatchTeamDto[] = [team(1), team(2), team(3)],
): TimingMatchDto => ({
    competitionSetupMatch: id,
    competition: 'comp-1',
    round: 'round-1',
    phase: 'ACTIVE',
    progress,
    teams,
})

describe('finishKeyTarget', () => {
    // Die Tasten zählen die Position in der fokussierten Partie nach Startnummer — nicht die
    // Startnummer selbst, denn die wiederholt sich über Wettkämpfe hinweg und kann Lücken haben.
    const focused = match('m1', 'STARTED', [team(4), team(2), team(9)])

    it('trifft mit der ersten Reihe die Position nach Startnummer', () => {
        expect(finishKeyTarget(focused, '1', DEFAULT_BOAT_KEYS)?.teamId).toBe('team-2')
        expect(finishKeyTarget(focused, '2', DEFAULT_BOAT_KEYS)?.teamId).toBe('team-4')
        expect(finishKeyTarget(focused, '3', DEFAULT_BOAT_KEYS)?.teamId).toBe('team-9')
    })

    it('trifft mit der zweiten Reihe dieselben Positionen', () => {
        expect(finishKeyTarget(focused, 'a', DEFAULT_BOAT_KEYS)?.teamId).toBe('team-2')
        expect(finishKeyTarget(focused, 'B', DEFAULT_BOAT_KEYS)?.teamId).toBe('team-4')
        expect(finishKeyTarget(focused, 'c', DEFAULT_BOAT_KEYS)?.teamId).toBe('team-9')
    })

    it('folgt einer freien Belegung statt fest verdrahteter Bereiche', () => {
        // Die Reihenfolge IN der Reihe zählt, nicht der Zeichenwert: „q" ist Position 1, weil es
        // vorne steht — genau darum geht die Belegung am Zeitnahmetyp.
        const layout: BoatKeyLayout = {primary: 'qwe', secondary: 'uio'}
        expect(finishKeyTarget(focused, 'q', layout)?.teamId).toBe('team-2')
        expect(finishKeyTarget(focused, 'w', layout)?.teamId).toBe('team-4')
        expect(finishKeyTarget(focused, 'i', layout)?.teamId).toBe('team-4')
        expect(finishKeyTarget(focused, 'o', layout)?.teamId).toBe('team-9')
    })

    it('trifft mit einer Taste außerhalb beider Reihen nichts', () => {
        const layout: BoatKeyLayout = {primary: 'qwe', secondary: 'uio'}
        expect(finishKeyTarget(focused, 'z', layout)).toBeUndefined()
        expect(finishKeyTarget(focused, '1', layout)).toBeUndefined()
        // Die Leertaste gehört dem großen Erfassungsknopf und darf nie ein Boot treffen.
        expect(finishKeyTarget(focused, ' ', layout)).toBeUndefined()
    })

    it('lässt eine leere zweite Reihe zu', () => {
        const layout: BoatKeyLayout = {primary: '123456', secondary: null}
        expect(finishKeyTarget(focused, '1', layout)?.teamId).toBe('team-2')
        expect(finishKeyTarget(focused, 'a', layout)).toBeUndefined()
    })

    it('trifft mit Groß- und Kleinschreibung dieselbe Position', () => {
        // Das Board liest den Tastendruck ohne Rücksicht auf die Umschalttaste — deshalb muss
        // eine klein geschriebene Belegung auch einen großen Tastendruck annehmen.
        const layout: BoatKeyLayout = {primary: 'ab', secondary: 'XY'}
        expect(finishKeyTarget(focused, 'A', layout)?.teamId).toBe('team-2')
        expect(finishKeyTarget(focused, 'a', layout)?.teamId).toBe('team-2')
        expect(finishKeyTarget(focused, 'x', layout)?.teamId).toBe('team-2')
        expect(finishKeyTarget(focused, 'Y', layout)?.teamId).toBe('team-4')
    })

    it('liefert undefined für Positionen außerhalb der Partie', () => {
        expect(finishKeyTarget(focused, '4', DEFAULT_BOAT_KEYS)).toBeUndefined()
        expect(finishKeyTarget(focused, 'd', DEFAULT_BOAT_KEYS)).toBeUndefined()
    })

    it('liefert undefined ohne fokussierte Partie', () => {
        expect(finishKeyTarget(undefined, '1', DEFAULT_BOAT_KEYS)).toBeUndefined()
    })

    it('meldet mit, ob das Boot an diesem Posten schon im Ziel ist', () => {
        // Der Aufrufer lässt die Taste dann wirkungslos verpuffen — kein Doppelstempel per
        // Tastatur; Korrekturen laufen über die Zeitenliste.
        const withFinished = match('m1', 'STARTED', [team(1, {finished: true}), team(2)])
        expect(finishKeyTarget(withFinished, '1', DEFAULT_BOAT_KEYS)?.finished).toBe(true)
        expect(finishKeyTarget(withFinished, '2', DEFAULT_BOAT_KEYS)?.finished).toBe(false)
    })
})

describe('boatKeyLayout', () => {
    // Nur die zwei Felder, die die Belegung ausmachen — mehr liest `boatKeyLayout` nicht, und
    // mehr braucht der Test deshalb auch nicht zusammenzubauen.
    const mode = (overrides: Partial<TimingModeKeys> = {}): TimingModeKeys => ({
        boatKeysPrimary: '123456',
        boatKeysSecondary: 'ABCDEF',
        ...overrides,
    })

    it('nimmt die Belegung des Zeitnahmetyps', () => {
        expect(boatKeyLayout(mode({boatKeysPrimary: 'qwe', boatKeysSecondary: 'uio'}))).toEqual({
            primary: 'qwe',
            secondary: 'uio',
        })
    })

    it('behandelt eine fehlende zweite Reihe als „keine"', () => {
        expect(boatKeyLayout(mode({boatKeysSecondary: null}))).toEqual({
            primary: '123456',
            secondary: null,
        })
    })

    it('fällt ohne Zeitnahmetyp auf die Vorgabebelegung zurück', () => {
        // Ein Lauf ohne Typ ist kein Sonderfall am Zielposten — er wird erfasst wie jeder andere,
        // nur eben mit der Belegung, die vor dem 26.08.2026 fest verdrahtet war.
        expect(boatKeyLayout(null)).toEqual(DEFAULT_BOAT_KEYS)
        expect(boatKeyLayout(undefined)).toEqual(DEFAULT_BOAT_KEYS)
    })
})

describe('boatKeyHint', () => {
    it('zeigt beide Reihen einer Position', () => {
        expect(boatKeyHint(DEFAULT_BOAT_KEYS, 0)).toBe('1/A')
        expect(boatKeyHint(DEFAULT_BOAT_KEYS, 5)).toBe('6/F')
    })

    it('zeigt ohne zweite Reihe nur die erste', () => {
        expect(boatKeyHint({primary: '123456', secondary: null}, 2)).toBe('3')
    })

    it('zeigt nichts, wo keine Taste liegt', () => {
        // Ein Hinweis, der eine Taste verspricht, die nichts tut, ist schlimmer als keiner: Der
        // Bediener greift unter Zeitdruck ins Leere.
        expect(boatKeyHint({primary: 'qwe', secondary: null}, 3)).toBeUndefined()
        expect(boatKeyHint(DEFAULT_BOAT_KEYS, 6)).toBeUndefined()
    })

    it('zeigt auch eine zweite Reihe, die länger ist als die erste', () => {
        expect(boatKeyHint({primary: 'qw', secondary: 'uiop'}, 2)).toBe('o')
    })
})

describe('boatKeyRows', () => {
    it('nennt beide Reihen im Hilfesatz', () => {
        expect(boatKeyRows(DEFAULT_BOAT_KEYS)).toBe('1 2 3 4 5 6 / A B C D E F')
    })

    it('nennt ohne zweite Reihe nur die erste', () => {
        expect(boatKeyRows({primary: 'qwe', secondary: null})).toBe('q w e')
    })
})

describe('resolveFinishFocus', () => {
    it('fokussiert ohne Wahl die erste Partie auf dem Wasser', () => {
        const matches = [match('m1', 'FINISHED'), match('m2', 'STARTED'), match('m3', 'STARTING')]
        expect(resolveFinishFocus(matches, undefined)).toBe('m2')
    })

    it('behält eine von Hand fokussierte Partie, solange sie auf dem Wasser ist', () => {
        const matches = [match('m1', 'STARTED'), match('m2', 'STARTING')]
        expect(resolveFinishFocus(matches, 'm2')).toBe('m2')
    })

    it('behält eine von Hand fokussierte OFFENE Partie (Zielzeiten ohne Start)', () => {
        // Jede Partie ist per Klick fokussierbar — auch ohne Start: der Zielposten kann so Zeiten
        // erfassen, bevor die Startmarke existiert. In die automatische Rotation kommen offene
        // Partien bewusst NICHT (siehe unten) — nur der explizite Klick hält sie im Fokus.
        const matches = [match('m1', 'STARTED'), match('m2', 'OPEN')]
        expect(resolveFinishFocus(matches, 'm2')).toBe('m2')
    })

    it('rückt vor, sobald die fokussierte Partie fertig ist', () => {
        // Das Vorrücken: alle Boote von m1 sind im Ziel, der Fokus springt auf die nächste
        // laufende Partie, damit die Tasten sofort wieder das Richtige treffen.
        const matches = [match('m1', 'FINISHED'), match('m2', 'STARTED')]
        expect(resolveFinishFocus(matches, 'm1')).toBe('m2')
    })

    it('nimmt offene Partien nie von selbst in den Fokus', () => {
        // Die automatische Vorauswahl bleibt auf Partien auf dem Wasser beschränkt — eine offene
        // Partie fokussiert nur der explizite Klick.
        const matches = [match('m1', 'FINISHED'), match('m2', 'OPEN')]
        expect(resolveFinishFocus(matches, undefined)).toBeUndefined()
        // Auch nach dem Zieleinlauf der fokussierten Partie springt der Fokus nicht auf offene.
        expect(resolveFinishFocus(matches, 'm1')).toBeUndefined()
    })

    it('liefert undefined, wenn nichts auf dem Wasser ist', () => {
        const matches = [match('m1', 'FINISHED'), match('m2', 'FINISHED')]
        expect(resolveFinishFocus(matches, undefined)).toBeUndefined()
    })
})

describe('cycleFocus', () => {
    it('wandert vorwärts und springt am Ende an den Anfang', () => {
        expect(cycleFocus(['a', 'b', 'c'], 'a', 1)).toBe('b')
        expect(cycleFocus(['a', 'b', 'c'], 'c', 1)).toBe('a')
    })

    it('wandert rückwärts und springt am Anfang ans Ende', () => {
        expect(cycleFocus(['a', 'b', 'c'], 'b', -1)).toBe('a')
        expect(cycleFocus(['a', 'b', 'c'], 'a', -1)).toBe('c')
    })

    it('startet bei unbekanntem oder fehlendem Fokus am ersten Eintrag', () => {
        expect(cycleFocus(['a', 'b'], undefined, 1)).toBe('a')
        expect(cycleFocus(['a', 'b'], 'weg', 1)).toBe('a')
    })

    it('liefert undefined für eine leere Liste', () => {
        expect(cycleFocus([], 'a', 1)).toBeUndefined()
    })
})

describe('boatPosition', () => {
    // Dieselbe Zählung wie die Tasten: die Stelle nach Startnummer, nicht die Startnummer selbst.
    const focused = match('m1', 'STARTED', [team(4), team(2), team(9)])
    const other = match('m2', 'STARTED', [team(1), team(7)])

    it('zählt die Stelle nach Startnummer, 1-basiert', () => {
        expect(boatPosition([focused], 'team-2')).toBe(1)
        expect(boatPosition([focused], 'team-4')).toBe(2)
        expect(boatPosition([focused], 'team-9')).toBe(3)
    })

    it('findet ein Boot auch in einer nicht fokussierten Partie', () => {
        // Ein Boots-Tipp trifft auch die erwarteten Partien darunter — die Stelle zählt dann
        // innerhalb DERER Partie, nicht über die Liste hinweg.
        expect(boatPosition([focused, other], 'team-7')).toBe(2)
    })

    it('liefert undefined für ein unbekanntes Boot', () => {
        expect(boatPosition([focused], 'team-fremd')).toBeUndefined()
    })

    it('liefert undefined ohne Partien', () => {
        expect(boatPosition([], 'team-2')).toBeUndefined()
    })
})
