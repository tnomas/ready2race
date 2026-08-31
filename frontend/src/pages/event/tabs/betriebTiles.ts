import {Privilege} from '@api/types.gen.ts'
import {
    readBoardGlobal,
    readEventGlobal,
    readLiveDashboardGlobal,
    readStreamGlobal,
    updateEventGlobal,
} from '@authorization/privileges.ts'

/**
 * Welche Kacheln der Betrieb-Reiter zeigt, rein aus den Privilegien abgeleitet. Pure Funktion,
 * damit die Sichtbarkeitsregeln testbar sind, ohne den Reiter zu rendern.
 *
 * Grundsatz: eine Kachel erscheint nur, wenn ihr Ziel für die Person auch erreichbar ist — sonst
 * wäre der Reiter eine Sammlung von 403-Türen. Die Regeln spiegeln deshalb die Zugriffsprüfungen
 * der jeweiligen Ziele:
 * - Schiedsrichter:in → Live-Dashboard (`readLiveDashboardGlobal`, wie dessen Route)
 * - Sprecher:in → Sprecher-Ansicht (Boards-Leserecht oder Veranstaltungs-Leserecht, wie die
 *   bisherige Karte auf dem Allgemein-Tab)
 * - Zeitnahme → Postenverwaltung + Leitstand (`updateEventGlobal`, wie deren Server-Endpunkte)
 * - Öffentliche Anzeigen → Board-Verwaltung (Boards- oder Veranstaltungs-Leserecht, wie die
 *   Boards-Seite)
 * - Livestream → Szenen-Verwaltung (Stream- oder Veranstaltungs-Leserecht, wie deren Route).
 *   Bis zum 31.08.2026 waren Anzeigen und Livestream EINE Kachel mit dem Boards-Recht — eine
 *   reine Stream-Rolle fand ihre Szenen damit gar nicht erst.
 * - Helfer:innen → Helfer-App und Schichtplan (`readEventGlobal`, wie der Organisation-Tab)
 */
export type BetriebTileId = 'referee' | 'speaker' | 'timing' | 'boards' | 'livestream' | 'helpers'

export function visibleBetriebTiles(
    checkPrivilege: (privilege: Privilege) => boolean,
): BetriebTileId[] {
    const tiles: BetriebTileId[] = []
    if (checkPrivilege(readLiveDashboardGlobal)) tiles.push('referee')
    if (checkPrivilege(readEventGlobal) || checkPrivilege(readBoardGlobal)) tiles.push('speaker')
    if (checkPrivilege(updateEventGlobal)) tiles.push('timing')
    if (checkPrivilege(readEventGlobal) || checkPrivilege(readBoardGlobal)) tiles.push('boards')
    if (checkPrivilege(readEventGlobal) || checkPrivilege(readStreamGlobal)) {
        tiles.push('livestream')
    }
    if (checkPrivilege(readEventGlobal)) tiles.push('helpers')
    return tiles
}
