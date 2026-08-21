import {TimingMatchPhase, TimingTeamDto} from '@api/types.gen.ts'

/**
 * Das Board erwartet zuerst die Teams, deren Lauf gerade dran ist. Innerhalb einer Phase bleibt die
 * gewohnte Startnummern-Reihenfolge (ohne Nummer ans Ende) - dieselbe Sortierung, die die Seite
 * vor der Phasen-Einführung insgesamt hatte. Die Reihenfolge ist zugleich die Gruppierung des
 * Zuordnungs-Dialogs (MUI-Autocomplete verlangt nach Gruppe vorsortierte Optionen).
 */
const PHASE_RANK: Record<TimingMatchPhase, number> = {ACTIVE: 0, OPEN: 1, DONE: 2}

export function orderTeamsForBoard(teams: TimingTeamDto[]): TimingTeamDto[] {
    return [...teams].sort(
        (a, b) =>
            PHASE_RANK[a.matchPhase] - PHASE_RANK[b.matchPhase] ||
            (a.startNumber ?? Infinity) - (b.startNumber ?? Infinity),
    )
}
