import {describe, expect, test} from 'vitest'
import {Privilege} from '@api/types.gen.ts'
import {BETRIEB_ACTION_TILE, visibleBetriebActions, visibleBetriebTiles} from './betriebTiles.ts'

const checkOf =
    (...granted: Privilege[]) =>
    (privilege: Privilege) =>
        granted.some(
            p =>
                p.action === privilege.action &&
                p.resource === privilege.resource &&
                p.scope === privilege.scope,
        )

const p = (action: Privilege['action'], resource: Privilege['resource']): Privilege => ({
    action,
    resource,
    scope: 'GLOBAL',
})

describe('visibleBetriebTiles', () => {
    test('ohne Privilegien keine Kacheln (der Reiter bleibt dann ganz weg)', () => {
        expect(visibleBetriebTiles(() => false)).toEqual([])
    })

    test('Veranstaltungsverwaltung (READ+UPDATE EVENT) sieht alle Kacheln', () => {
        const check = checkOf(p('READ', 'EVENT'), p('UPDATE', 'EVENT'), p('READ', 'LIVE_DASHBOARD'))
        expect(visibleBetriebTiles(check)).toEqual([
            'raceOffice',
            'referee',
            'speaker',
            'timing',
            'boards',
            'livestream',
            'helpers',
        ])
    })

    test('reine Schiedsrichter-Rolle sieht nur ihre Kachel', () => {
        expect(visibleBetriebTiles(checkOf(p('READ', 'LIVE_DASHBOARD')))).toEqual(['referee'])
    })

    test('reine Board-Rolle sieht Sprecher- und Anzeigen-Kachel, aber weder Zeitnahme noch Livestream', () => {
        // Anzeigen und Livestream sind seit dem 31.08.2026 getrennte Kacheln mit getrennten
        // Rechten - das Boards-Recht öffnet nicht mehr nebenbei die Szenen-Verwaltung.
        expect(visibleBetriebTiles(checkOf(p('READ', 'BOARD')))).toEqual(['speaker', 'boards'])
    })

    test('reine Stream-Rolle sieht genau die Livestream-Kachel', () => {
        expect(visibleBetriebTiles(checkOf(p('READ', 'STREAM')))).toEqual(['livestream'])
    })

    test('Leserecht auf die Veranstaltung reicht nicht fuer die Zeitnahme-Kachel', () => {
        const tiles = visibleBetriebTiles(checkOf(p('READ', 'EVENT')))
        expect(tiles).not.toContain('timing')
        expect(tiles).toEqual(['raceOffice', 'speaker', 'boards', 'livestream', 'helpers'])
    })

    test('Regattabüro braucht das Leserecht auf die Veranstaltung, Boards/Stream reichen nicht', () => {
        expect(visibleBetriebTiles(checkOf(p('READ', 'BOARD')))).not.toContain('raceOffice')
        expect(visibleBetriebTiles(checkOf(p('READ', 'STREAM')))).not.toContain('raceOffice')
        expect(visibleBetriebTiles(checkOf(p('READ', 'LIVE_DASHBOARD')))).not.toContain(
            'raceOffice',
        )
    })

    test('die Regattabüro-Kachel macht den Reiter für niemanden neu sichtbar', () => {
        // Wer das Regattabüro sieht, sah vorher schon die Sprecher-Kachel (gleiche Bedingung).
        const roles = [
            [],
            [p('READ', 'EVENT')],
            [p('READ', 'BOARD')],
            [p('READ', 'STREAM')],
            [p('READ', 'LIVE_DASHBOARD')],
            [p('UPDATE', 'EVENT')],
        ]
        for (const granted of roles) {
            const tiles = visibleBetriebTiles(checkOf(...granted))
            if (tiles.includes('raceOffice')) expect(tiles).toContain('speaker')
        }
    })
})

describe('visibleBetriebActions', () => {
    test('ohne Privilegien keine Zusatzknöpfe', () => {
        expect(visibleBetriebActions(() => false)).toEqual([])
    })

    test('Veranstaltungsverwaltung mit Nutzer-Leserecht sieht alle Zusatzknöpfe', () => {
        const check = checkOf(
            p('READ', 'EVENT'),
            p('UPDATE', 'EVENT'),
            p('READ', 'LIVE_DASHBOARD'),
            p('READ', 'USER'),
        )
        expect(visibleBetriebActions(check)).toEqual([
            'manageRunningMatches',
            'openSchedule',
            'checkSeverity',
            'openShifts',
        ])
    })

    test('Prüfungen verwalten verlangt Schiedsrichter-Kachel UND UPDATE EVENT (wie bisher)', () => {
        expect(visibleBetriebActions(checkOf(p('READ', 'LIVE_DASHBOARD')))).toEqual([])
        // UPDATE EVENT ohne Schiedsrichter-Recht: keine Kachel, also auch kein Knopf
        expect(visibleBetriebActions(checkOf(p('UPDATE', 'EVENT')))).not.toContain('checkSeverity')
        expect(
            visibleBetriebActions(checkOf(p('READ', 'LIVE_DASHBOARD'), p('UPDATE', 'EVENT'))),
        ).toEqual(['checkSeverity'])
    })

    test('Laufende Läufe und Zeitplan-Sprung mit READ EVENT, Schichtplan erst mit READ USER', () => {
        expect(visibleBetriebActions(checkOf(p('READ', 'EVENT')))).toEqual([
            'manageRunningMatches',
            'openSchedule',
        ])
        expect(visibleBetriebActions(checkOf(p('READ', 'EVENT'), p('READ', 'USER')))).toEqual([
            'manageRunningMatches',
            'openSchedule',
            'openShifts',
        ])
    })

    test('Challenge-Veranstaltung: ohne Laufende Läufe und ohne Prüfungen', () => {
        const check = checkOf(
            p('READ', 'EVENT'),
            p('UPDATE', 'EVENT'),
            p('READ', 'LIVE_DASHBOARD'),
            p('READ', 'USER'),
        )
        expect(visibleBetriebActions(check, {challengeEvent: true})).toEqual([
            'openSchedule',
            'openShifts',
        ])
        expect(visibleBetriebActions(check, {challengeEvent: false})).toEqual([
            'manageRunningMatches',
            'openSchedule',
            'checkSeverity',
            'openShifts',
        ])
        // ohne Angabe wie bisher (keine Challenge)
        expect(visibleBetriebActions(check)).toEqual(
            visibleBetriebActions(check, {challengeEvent: false}),
        )
    })

    test('jede sichtbare Aktion hat ihre Kachel sichtbar', () => {
        const all: Privilege[] = [
            p('READ', 'EVENT'),
            p('UPDATE', 'EVENT'),
            p('READ', 'LIVE_DASHBOARD'),
            p('READ', 'USER'),
            p('READ', 'BOARD'),
            p('READ', 'STREAM'),
        ]
        // alle Teilmengen der Rechte durchprobieren
        for (let mask = 0; mask < 1 << all.length; mask++) {
            const check = checkOf(...all.filter((_, i) => mask & (1 << i)))
            const tiles = visibleBetriebTiles(check)
            for (const action of visibleBetriebActions(check)) {
                expect(tiles).toContain(BETRIEB_ACTION_TILE[action])
            }
        }
    })
})
