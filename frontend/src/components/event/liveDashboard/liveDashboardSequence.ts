import {
    LiveDashboardMatchDto,
    LiveDashboardSequenceDto,
    LiveDashboardSequenceState,
    LiveDashboardTeamDto,
    SequenceMode,
} from '@api/types.gen.ts'

/**
 * Die Startsequenz auf der Laufkarte des Schiedsrichter-Dashboards — reine Ableitungen über dem
 * Dashboard-Datensatz, ohne React, damit sie ohne Rendering prüfbar sind.
 *
 * Die Daten kommen NICHT über den Zeitnahme-Kanal, sondern mit dem gewöhnlichen Poll
 * (`LiveDashboardMatchDto.sequence`, `LiveDashboardTeamDto.sequenceEntry`): der Server löst die
 * aktive Sequenz je Lauf auf, der Veranstaltungs-Push feuert bei jeder Sequenz-Mutation, und das
 * Dashboard lädt darauf nach. Hier wird daraus nur noch gerechnet, was die Karte zeigt.
 */

export type SequenceProgress = {
    state: LiveDashboardSequenceState
    mode: SequenceMode
    /** Boote dieses Laufs, die ihre Startmarke schon haben. */
    startedCount: number
    /** Boote dieses Laufs in der Sequenz, ohne die übersprungenen. */
    total: number
    /** Das Boot dieses Laufs, das als Nächstes startet — das anstehende mit der kleinsten Position. */
    next: LiveDashboardTeamDto | null
    /** Geplanter Start von [next] als Server-Epoch-Millis; null solange die Sequenz nur scharf ist. */
    targetMillis: number | null
    /**
     * Bei Pause: der Reststand, auf dem die Uhr steht — `targetMillis − pausedAtMillis`, eine
     * reine Serverzeit-Differenz. Das Fortsetzen verschiebt die Starts exakt um die Pausendauer,
     * der eingefrorene Wert läuft danach nahtlos weiter.
     */
    frozenRemainingMillis: number | null
}

export const sequenceProgress = (match: LiveDashboardMatchDto): SequenceProgress | null => {
    const sequence = match.sequence
    if (!sequence) return null
    const entered = match.teams.filter(team => team.sequenceEntry != null)
    const counted = entered.filter(team => team.sequenceEntry?.status !== 'SKIPPED')
    const startedCount = counted.filter(team => team.sequenceEntry?.status === 'STARTED').length
    const next =
        counted
            .filter(team => team.sequenceEntry?.status === 'PENDING')
            .sort(
                (a, b) => (a.sequenceEntry?.position ?? 0) - (b.sequenceEntry?.position ?? 0),
            )[0] ?? null
    const targetMillis = next?.sequenceEntry?.plannedStartMillis ?? null
    const frozenRemainingMillis =
        sequence.state === 'PAUSED' && targetMillis != null && sequence.pausedAtMillis != null
            ? targetMillis - sequence.pausedAtMillis
            : null
    return {
        state: sequence.state,
        mode: sequence.mode,
        startedCount,
        total: counted.length,
        next,
        targetMillis,
        frozenRemainingMillis,
    }
}

export type TeamSequenceMarker = {kind: 'skipped'} | {kind: 'planned'; startMillis: number}

/**
 * Was die Bootszeile über die Sequenz sagt: „übersprungen", oder beim Zeitfahren der geplante
 * eigene Start, solange das Boot noch ansteht. Beim Wellenstart teilen alle Boote denselben
 * Startzeitpunkt — der steht im Streifen über der Tabelle, nicht sechsmal in den Zeilen. Ein
 * gestartetes Boot trägt seinen Ist-Start ohnehin schon (`team.startedAt`).
 */
export const teamSequenceMarker = (
    team: LiveDashboardTeamDto,
    sequence: LiveDashboardSequenceDto | null | undefined,
): TeamSequenceMarker | null => {
    const entry = team.sequenceEntry
    if (!sequence || !entry) return null
    if (entry.status === 'SKIPPED') return {kind: 'skipped'}
    if (
        entry.status === 'PENDING' &&
        sequence.mode === 'INTERVAL' &&
        sequence.state !== 'ARMED' &&
        entry.plannedStartMillis != null
    ) {
        return {kind: 'planned', startMillis: entry.plannedStartMillis}
    }
    return null
}

/**
 * Ob die Karte den Rückruf zeigt. Der Server leert den Stempel mit dem nächsten Ist-Start; die
 * Bedingung auf den fehlenden Start ist das Netz darunter — ein Lauf, der läuft, hatte keinen
 * Fehlstart, den man noch melden müsste.
 */
export const showsFalseStart = (match: LiveDashboardMatchDto): boolean =>
    match.falseStartAt != null && match.startedAt == null
