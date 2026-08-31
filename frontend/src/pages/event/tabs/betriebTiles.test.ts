import {describe, expect, test} from 'vitest'
import {Privilege} from '@api/types.gen.ts'
import {visibleBetriebTiles} from './betriebTiles.ts'

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
        const check = checkOf(
            p('READ', 'EVENT'),
            p('UPDATE', 'EVENT'),
            p('READ', 'LIVE_DASHBOARD'),
        )
        expect(visibleBetriebTiles(check)).toEqual([
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
        expect(tiles).toEqual(['speaker', 'boards', 'livestream', 'helpers'])
    })
})
