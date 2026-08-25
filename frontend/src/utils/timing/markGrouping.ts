import {TimingMatchDto} from '@api/types.gen.ts'
import {BoardMark} from '@components/timing/useTimingBoardState.ts'

/**
 * Eine Gruppe der Zeitenliste: die Marken einer Partie (über ihr zugeordnetes Boot aufgelöst),
 * jüngste zuerst — oder, mit `match === undefined`, die Sammelgruppe der unzugeordneten und
 * unbekannten Marken.
 */
export type MarkGroup = {
    match: TimingMatchDto | undefined
    marks: BoardMark[]
}

/**
 * Die Zeitenliste nach Partie gruppieren: jede Zeit trägt Partie UND Boot, und die Blöcke zeigen,
 * was zusammen gestartet wurde. Die Auflösung läuft über die Team-Zuordnung der Marke — eine
 * unzugeordnete Marke (oder eine, deren Team in keiner Partie liegt, z.B. nach einem
 * Wettkampf-Umbau) landet in der Sammelgruppe ohne Partie, denn verschwinden darf sie nie.
 *
 * Reihenfolge: Gruppen nach ihrer jüngsten Marke absteigend (die Partie mit dem frischesten
 * Stempel oben), Marken innerhalb der Gruppe ebenfalls jüngste zuerst — dieselbe Leserichtung wie
 * die bisherige flache Liste.
 */
export function groupMarksByMatch(marks: BoardMark[], matches: TimingMatchDto[]): MarkGroup[] {
    const matchByTeam = new Map<string, TimingMatchDto>()
    for (const match of matches) {
        for (const team of match.teams) {
            matchByTeam.set(team.competitionMatchTeam, match)
        }
    }

    const byMatch = new Map<TimingMatchDto | undefined, BoardMark[]>()
    for (const mark of marks) {
        const match =
            mark.assignedTeam != null ? matchByTeam.get(mark.assignedTeam) : undefined
        const bucket = byMatch.get(match)
        if (bucket === undefined) {
            byMatch.set(match, [mark])
        } else {
            bucket.push(mark)
        }
    }

    return [...byMatch.entries()]
        .map(([match, groupMarks]) => ({
            match,
            marks: [...groupMarks].sort((a, b) => b.timestampMillis - a.timestampMillis),
        }))
        .sort((a, b) => b.marks[0].timestampMillis - a.marks[0].timestampMillis)
}
