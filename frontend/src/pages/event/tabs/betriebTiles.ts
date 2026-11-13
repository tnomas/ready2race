import {Privilege} from '@api/types.gen.ts'
import {
    readBoardGlobal,
    readEventGlobal,
    readLiveDashboardGlobal,
    readStreamGlobal,
    readUserGlobal,
    updateEventGlobal,
} from '@authorization/privileges.ts'

/**
 * Welche Kacheln der Betrieb-Reiter zeigt, rein aus den Privilegien abgeleitet. Pure Funktion,
 * damit die Sichtbarkeitsregeln testbar sind, ohne den Reiter zu rendern.
 *
 * Grundsatz: eine Kachel erscheint nur, wenn ihr Ziel für die Person auch erreichbar ist — sonst
 * wäre der Reiter eine Sammlung von 403-Türen. Die Regeln spiegeln deshalb die Zugriffsprüfungen
 * der jeweiligen Ziele:
 * - Regattabüro → Laufende Läufe verwalten und Sprung in den Zeitplan (`readEventGlobal`, wie der
 *   bisherige Knopf auf der Übersicht und der Zeitplan-Bereich). Seit dem 13.11.2026 eine eigene
 *   Kachel (ADR-0093: jede Renntag-Rolle bekommt eine Kachel).
 * - Schiedsrichter:in → Schiedsrichter-Dashboard (`readLiveDashboardGlobal`, wie dessen Route)
 * - Sprecher:in → Sprecher-Board (Boards-Leserecht oder Veranstaltungs-Leserecht, wie die
 *   bisherige Karte auf dem Allgemein-Tab)
 * - Zeitnahme → Postenverwaltung + Leitstand (`updateEventGlobal`, wie deren Server-Endpunkte)
 * - Öffentliche Anzeigen → Board-Verwaltung (Boards- oder Veranstaltungs-Leserecht, wie die
 *   Boards-Seite)
 * - Livestream → Szenen-Verwaltung (Stream- oder Veranstaltungs-Leserecht, wie deren Route).
 *   Bis zum 31.08.2026 waren Anzeigen und Livestream EINE Kachel mit dem Boards-Recht — eine
 *   reine Stream-Rolle fand ihre Szenen damit gar nicht erst.
 * - Helfer:innen → Helfer-App und Schichtplan (`readEventGlobal`, wie der Organisation-Tab)
 *
 * Die Regattabüro-Kachel ändert nichts daran, WER den Reiter sieht: sie verlangt dasselbe Recht
 * wie die Sprecher-Kachel, die es schon gab.
 */
export type BetriebTileId =
    | 'raceOffice'
    | 'referee'
    | 'speaker'
    | 'timing'
    | 'boards'
    | 'livestream'
    | 'helpers'

export function visibleBetriebTiles(
    checkPrivilege: (privilege: Privilege) => boolean,
): BetriebTileId[] {
    const tiles: BetriebTileId[] = []
    if (checkPrivilege(readEventGlobal)) tiles.push('raceOffice')
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

/**
 * Zusätzliche Knöpfe innerhalb einer Kachel, die ein strengeres Recht verlangen als die Kachel
 * selbst. Jede Aktion gehört zu genau einer Kachel und erscheint nur, wenn auch die Kachel
 * sichtbar ist:
 * - `manageRunningMatches` (Regattabüro): Laufende Läufe verwalten, `readEventGlobal` — wie der
 *   bisherige Knopf auf der Übersicht.
 * - `openSchedule` (Regattabüro): Sprung in den Zeitplan-Bereich, `readEventGlobal` — wie der
 *   Bereich selbst (`eventSections.ts`).
 * - `checkSeverity` (Schiedsrichter:in): Prüfungen verwalten, zusätzlich `updateEventGlobal` — wie
 *   der bisherige Knopf in der Karte „Schiedsrichter-Dashboard" auf der Übersicht.
 * - `openShifts` (Helfer:innen): Sprung zum Schichtplan, zusätzlich `readUserGlobal` — wie der
 *   Bereich „Team & Helfer".
 */
export type BetriebActionId =
    | 'manageRunningMatches'
    | 'openSchedule'
    | 'checkSeverity'
    | 'openShifts'

export const BETRIEB_ACTION_TILE: Record<BetriebActionId, BetriebTileId> = {
    manageRunningMatches: 'raceOffice',
    openSchedule: 'raceOffice',
    checkSeverity: 'referee',
    openShifts: 'helpers',
}

export type BetriebActionOptions = {
    /**
     * Challenge-Veranstaltung: ohne Läufe in der Arena und ohne Prüfungen am Steg. Wie früher auf
     * der Übersicht (Karten „Öffentliche Anzeigen" und „Schiedsrichter-Dashboard") entfallen dann
     * „Laufende Läufe verwalten" und „Prüfungen verwalten".
     */
    challengeEvent?: boolean
}

export function visibleBetriebActions(
    checkPrivilege: (privilege: Privilege) => boolean,
    {challengeEvent = false}: BetriebActionOptions = {},
): BetriebActionId[] {
    const tiles = visibleBetriebTiles(checkPrivilege)
    const actions: BetriebActionId[] = []
    if (checkPrivilege(readEventGlobal)) {
        if (!challengeEvent) actions.push('manageRunningMatches')
        actions.push('openSchedule')
    }
    if (checkPrivilege(updateEventGlobal) && !challengeEvent) actions.push('checkSeverity')
    if (checkPrivilege(readEventGlobal) && checkPrivilege(readUserGlobal))
        actions.push('openShifts')
    return actions.filter(action => tiles.includes(BETRIEB_ACTION_TILE[action]))
}
