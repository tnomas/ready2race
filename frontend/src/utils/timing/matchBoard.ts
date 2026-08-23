import {
    CreateSequenceRequest,
    TimingMatchDto,
    TimingMatchTeamDto,
    TimingModeDto,
    TimingStartGrouping,
} from '@api/types.gen.ts'
import {BoardMark} from '@components/timing/useTimingBoardState.ts'

/**
 * Reine Logik der Partie-orientierten Posten-Boards (Start und Ziel), herausgezogen aus den
 * Komponenten, damit sie ohne Netz und DOM testbar bleibt — dasselbe Muster wie
 * `sequenceDisplay.ts` für die Sequenz-Ansichten.
 */

/**
 * Die Startsequenz-Anfrage aus dem aufgelösten Zeitnahmetyp einer Partie ableiten:
 * `intervalSeconds != null` heißt Zeitfahren → INTERVAL-Sequenz mit dem Intervall in
 * Millisekunden, sonst MASS (ein Start von Hand für alle). Der Countdown-Vorlauf des Typs wird
 * unverändert als `leadInMillis` übernommen; die Teams starten in Startnummern-Reihenfolge.
 *
 * Bereits gestartete Boote (Nachzügler-Fall: die erste Sequenz wurde abgebrochen, ein Teil der
 * Partie ist schon auf dem Wasser) werden weggelassen — sie erneut in den Countdown zu stellen,
 * erzeugte eine zweite Startmarke für ein Boot, das längst unterwegs ist.
 */
export function sequenceRequestFromMode(
    stationId: string,
    mode: TimingModeDto,
    teams: TimingMatchTeamDto[],
): CreateSequenceRequest {
    const interval = mode.intervalSeconds ?? null
    return {
        station: stationId,
        mode: interval !== null ? 'INTERVAL' : 'MASS',
        intervalMillis: interval !== null ? interval * 1000 : undefined,
        leadInMillis: mode.leadInSeconds * 1000,
        teams: [...teams]
            .filter(team => !team.started)
            .sort((a, b) => a.startNumber - b.startNumber)
            .map(team => team.competitionMatchTeam),
    }
}

/**
 * Vorauswahl des Startpostens: die von Hand gewählte Partie bleibt gewählt, solange sie offen
 * ist; sonst (oder ohne Wahl) die erste offene Partie in gelieferter Reihenfolge — das ist das
 * „Vorrücken" nach einem Start, weil die gestartete Partie auf STARTING/STARTED springt und
 * damit aus der Auswahl fällt. Ohne offene Partie gibt es nichts mehr zu starten (undefined).
 */
export function resolveStartSelection(
    matches: TimingMatchDto[],
    selectedId: string | undefined,
): string | undefined {
    const selected = matches.find(
        match => match.competitionSetupMatch === selectedId && match.progress === 'OPEN',
    )
    if (selected !== undefined) return selected.competitionSetupMatch
    return matches.find(match => match.progress === 'OPEN')?.competitionSetupMatch
}

export type ExpectedFinishMatches = {
    /** Partien, deren Boote gerade erwartet werden: gestartet oder mitten im Startvorgang. */
    current: TimingMatchDto[]
    /**
     * Die nächste offene Partie als Vorschau — nur solange nichts auf dem Wasser ist, damit der
     * Zielposten zwischen zwei Läufen sieht, was als Nächstes kommt, ohne dass die Vorschau
     * neben einer laufenden Partie um Aufmerksamkeit konkurriert.
     */
    upcoming: TimingMatchDto | undefined
}

/**
 * Welche Partien der Zielposten anzeigen soll — siehe {@link ExpectedFinishMatches}. Die per
 * Klick fokussierte Partie [focusedId] kommt zusätzlich in die Arbeitsfläche, auch wenn sie noch
 * nicht auf dem Wasser ist (Zielzeiten ohne Start): ihre Boots-Knöpfe und Tasten müssen bedienbar
 * sein, bevor eine Startmarke existiert. Ist sie dabei, entfällt die Vorschau — die fokussierte
 * Partie IST dann die Fläche.
 */
export function expectedFinishMatches(
    matches: TimingMatchDto[],
    focusedId?: string,
): ExpectedFinishMatches {
    const current = matches.filter(
        match =>
            match.progress === 'STARTED' ||
            match.progress === 'STARTING' ||
            match.competitionSetupMatch === focusedId,
    )
    return {
        current,
        upcoming:
            current.length === 0
                ? matches.find(match => match.progress === 'OPEN')
                : undefined,
    }
}

/**
 * Die Zeit, die am Zielposten als Nächstes zugeordnet werden will: die älteste unzugeordnete,
 * aktive, bereits gespeicherte Marke — Boote laufen in der Reihenfolge ein, in der gestempelt
 * wurde, also wird auch in dieser Reihenfolge zugeordnet. `skipped` sind bewusst vertagte
 * Marken (unbekanntes Boot): sie bleiben in der Liste, drängen sich aber nicht mehr auf.
 *
 * Noch nicht gespeicherte (`pending`) oder fehlgeschlagene (`failed`) Marken zählen nicht:
 * eine Zuordnung auf eine Marke, die der Server nicht kennt, kann nur fehlschlagen.
 */
export function pendingAssignmentMark(
    marks: BoardMark[],
    skipped: Set<string>,
): BoardMark | undefined {
    return marks
        .filter(
            mark =>
                mark.status === 'ACTIVE' &&
                mark.assignedTeam == null &&
                !mark.pending &&
                !mark.failed &&
                !skipped.has(mark.id),
        )
        .sort((a, b) => a.timestampMillis - b.timestampMillis)[0]
}

export type DayScheduleStatus = {
    kind: TimingMatchDto['progress']
    /** Boote mit Zielmarke — nur bei `STARTED` als „n/m im Ziel" angezeigt. */
    finished: number
    total: number
}

/**
 * Der Status einer Partie in der Tagesablauf-Spalte: offen / Sequenz läuft / gestartet (mit
 * „n/m im Ziel") / fertig. Nur eine dünne Ableitung über `progress` plus Ziel-Zählung — als Daten
 * statt Text, damit die Übersetzung in der Komponente bleibt.
 */
export function dayScheduleStatus(match: TimingMatchDto): DayScheduleStatus {
    return {
        kind: match.progress,
        finished: match.teams.filter(team => team.finished).length,
        total: match.teams.length,
    }
}

export type ModeChipParts = {
    name: string
    /** null = Start von Hand (kein automatisches Intervall). */
    intervalSeconds: number | null
    startGrouping: TimingStartGrouping
    withLaps: boolean
}

/**
 * Die anzeigerelevanten Teile eines Zeitnahmetyps für den Chip an der Partie — als Daten statt
 * als fertiger Text, damit die Übersetzung in der Komponente bleibt und die Ableitung testbar ist.
 */
export function modeChipParts(mode: TimingModeDto): ModeChipParts {
    return {
        name: mode.name,
        intervalSeconds: mode.intervalSeconds ?? null,
        startGrouping: mode.startGrouping,
        withLaps: mode.withLaps,
    }
}
