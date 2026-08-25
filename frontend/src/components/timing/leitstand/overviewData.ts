import {TimeMarkDto, TimingMatchDto, TimingSequenceDto} from '@api/types.gen.ts'

/**
 * Reine Datenaufbereitung der Leitstand-Übersicht: welche Läufe sind "zuletzt aktiv", was ist der
 * letzte Eingang je Posten, wie weit ist eine Sequenz. Ausgelagert, damit die Regeln ohne
 * React-Umgebung testbar sind.
 */

export type MatchActivity = {
    match: TimingMatchDto
    /** Jüngste Aktivität: späteste zugeordnete aktive Marke, sonst Ist-Start/Ende des Laufs. */
    lastActivityMillis: number
}

type MarkLike = Pick<TimeMarkDto, 'timestampMillis' | 'status' | 'assignedTeam' | 'station'>

/**
 * Die zuletzt aktiven Läufe, jüngste zuerst. Aktivität ist markenbasiert (zugeordnete ACTIVE-
 * Marken der Boote); Läufe ohne Marken zählen über ihren Ist-Start bzw. ihr Ende, sodass ein per
 * Hand gestarteter Lauf nicht unsichtbar bleibt. Läufe ganz ohne Aktivität erscheinen nicht -
 * die vollständige Liste hat ihren Platz in der Startlisten-Sicht, nicht in der Übersicht.
 */
export function recentlyActiveMatches(
    matches: TimingMatchDto[],
    marks: MarkLike[],
    limit: number,
): MatchActivity[] {
    const latestByTeam = new Map<string, number>()
    for (const mark of marks) {
        if (mark.status !== 'ACTIVE' || mark.assignedTeam === undefined) continue
        const previous = latestByTeam.get(mark.assignedTeam)
        if (previous === undefined || mark.timestampMillis > previous) {
            latestByTeam.set(mark.assignedTeam, mark.timestampMillis)
        }
    }

    const withActivity: MatchActivity[] = []
    for (const match of matches) {
        const markActivity = match.teams
            .map(team => latestByTeam.get(team.competitionMatchTeam))
            .filter((value): value is number => value !== undefined)
        const fallback = [match.finishedAt, match.startedAt]
            .filter((value): value is string => value !== undefined && value !== null)
            .map(value => new Date(value).getTime())
            .filter(value => Number.isFinite(value))
        const all = [...markActivity, ...fallback]
        if (all.length === 0) continue
        withActivity.push({match, lastActivityMillis: Math.max(...all)})
    }

    return withActivity.sort((a, b) => b.lastActivityMillis - a.lastActivityMillis).slice(0, limit)
}

/** Später Eingang je Posten - bewusst inklusive zurückgenommener Marken: eingegangen ist eingegangen. */
export function lastMarkByStation(marks: MarkLike[]): Map<string, number> {
    const latest = new Map<string, number>()
    for (const mark of marks) {
        const previous = latest.get(mark.station)
        if (previous === undefined || mark.timestampMillis > previous) {
            latest.set(mark.station, mark.timestampMillis)
        }
    }
    return latest
}

export type SequenceProgress = {
    started: number
    /** Einträge ohne die übersprungenen - deren Slot verstreicht leer und zählt nicht als offen. */
    total: number
}

/** Fortschritt „n/m gestartet" einer Sequenz. */
export function sequenceProgress(sequence: TimingSequenceDto): SequenceProgress {
    const counted = sequence.entries.filter(entry => entry.status !== 'SKIPPED')
    return {
        started: counted.filter(entry => entry.status === 'STARTED').length,
        total: counted.length,
    }
}
