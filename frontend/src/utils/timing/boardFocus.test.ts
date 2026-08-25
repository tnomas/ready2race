import {describe, expect, it} from 'vitest'
import {TimingMatchDto, TimingMatchTeamDto} from '@api/types.gen.ts'
import {cycleFocus, finishKeyTarget, resolveFinishFocus} from './boardFocus.ts'

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

    it('bildet Ziffern auf die Position nach Startnummer ab', () => {
        expect(finishKeyTarget(focused, '1')?.teamId).toBe('team-2')
        expect(finishKeyTarget(focused, '2')?.teamId).toBe('team-4')
        expect(finishKeyTarget(focused, '3')?.teamId).toBe('team-9')
    })

    it('behandelt Buchstaben A–F gleichwertig zu den Ziffern', () => {
        expect(finishKeyTarget(focused, 'a')?.teamId).toBe('team-2')
        expect(finishKeyTarget(focused, 'B')?.teamId).toBe('team-4')
        expect(finishKeyTarget(focused, 'c')?.teamId).toBe('team-9')
    })

    it('liefert undefined für Positionen außerhalb der Partie', () => {
        expect(finishKeyTarget(focused, '4')).toBeUndefined()
        expect(finishKeyTarget(focused, 'd')).toBeUndefined()
    })

    it('liefert undefined für Tasten außerhalb von 1–6 und A–F', () => {
        expect(finishKeyTarget(focused, '0')).toBeUndefined()
        expect(finishKeyTarget(focused, '7')).toBeUndefined()
        expect(finishKeyTarget(focused, 'g')).toBeUndefined()
        expect(finishKeyTarget(focused, ' ')).toBeUndefined()
    })

    it('liefert undefined ohne fokussierte Partie', () => {
        expect(finishKeyTarget(undefined, '1')).toBeUndefined()
    })

    it('meldet mit, ob das Boot an diesem Posten schon im Ziel ist', () => {
        // Der Aufrufer lässt die Taste dann wirkungslos verpuffen — kein Doppelstempel per
        // Tastatur; Korrekturen laufen über die Zeitenliste.
        const withFinished = match('m1', 'STARTED', [team(1, {finished: true}), team(2)])
        expect(finishKeyTarget(withFinished, '1')?.finished).toBe(true)
        expect(finishKeyTarget(withFinished, '2')?.finished).toBe(false)
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
