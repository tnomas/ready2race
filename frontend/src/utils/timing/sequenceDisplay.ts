import {SequenceState, TimingSequenceDto, TimingSequenceEntryDto} from '@api/types.gen.ts'

/**
 * Gemeinsame Ableitung der Startsequenz-Anzeige, herausgezogen aus dem Board, damit der
 * Startbildschirm (Zeitnahme) — die reine Anzeige-Route je START-Posten — dieselbe Logik nutzt
 * statt sie zu duplizieren. Alles hier ist pur und damit direkt testbar.
 */

/** Die Einträge einer Sequenz in Positionsreihenfolge, ohne die Eingabe zu verändern. */
export function sortedEntries(sequence: TimingSequenceDto): TimingSequenceEntryDto[] {
    return [...sequence.entries].sort((a, b) => a.position - b.position)
}

export type RunningEntrySplit = {
    /** Der nächste zu startende Eintrag (erster PENDING), oder undefined kurz vor Sequenzende. */
    next: TimingSequenceEntryDto | undefined
    /** Die weiteren PENDING-Einträge nach `next`. */
    following: TimingSequenceEntryDto[]
    /** Bereits gestartete oder übersprungene Einträge. */
    settled: TimingSequenceEntryDto[]
    /**
     * Countdown-Ziel: die geplante Startzeit des nächsten Eintrags. INTERVAL-Sequenzen planen erst
     * beim Feuern des Vorgängers, deshalb der Rückfall auf den Sequenzstart — aber nur solange es
     * überhaupt einen nächsten Eintrag gibt; ohne PENDING-Rest zählt nichts mehr herunter.
     */
    targetMillis: number | undefined
}

export function splitRunningEntries(sequence: TimingSequenceDto): RunningEntrySplit {
    const entries = sortedEntries(sequence)
    const pending = entries.filter(entry => entry.status === 'PENDING')
    const next = pending[0]
    return {
        next,
        following: pending.slice(1),
        settled: entries.filter(entry => entry.status !== 'PENDING'),
        targetMillis:
            next === undefined ? undefined : (next.plannedStartMillis ?? sequence.startedAtMillis),
    }
}

/**
 * Zustandssicht des Startbildschirms. `IDLE` deckt "keine Sequenz" ab (der Posten richtet gerade
 * nichts ein oder die letzte Sequenz wurde verworfen); `FINISHING` ist RUNNING ohne verbleibende
 * PENDING-Einträge — der letzte Start ist raus, der Server hat das Sequenzende nur noch nicht
 * bestätigt.
 */
export type StartDisplayView =
    | {kind: 'IDLE'}
    | {kind: 'ARMED'; entries: TimingSequenceEntryDto[]}
    | {
          kind: 'RUNNING'
          next: TimingSequenceEntryDto
          following: TimingSequenceEntryDto[]
          settled: TimingSequenceEntryDto[]
          targetMillis: number | undefined
      }
    | {kind: 'FINISHING'}
    | {kind: 'SETTLED'; state: Extract<SequenceState, 'DONE' | 'ABORTED'>; entries: TimingSequenceEntryDto[]}

export function deriveStartDisplay(sequence: TimingSequenceDto | undefined): StartDisplayView {
    if (sequence === undefined) return {kind: 'IDLE'}
    switch (sequence.state) {
        case 'ARMED':
            return {kind: 'ARMED', entries: sortedEntries(sequence)}
        case 'RUNNING': {
            const split = splitRunningEntries(sequence)
            if (split.next === undefined) return {kind: 'FINISHING'}
            return {
                kind: 'RUNNING',
                next: split.next,
                following: split.following,
                settled: split.settled,
                targetMillis: split.targetMillis,
            }
        }
        case 'DONE':
        case 'ABORTED':
            return {kind: 'SETTLED', state: sequence.state, entries: sortedEntries(sequence)}
    }
}

export function formatCountdown(remainingMillis: number): string {
    const totalSeconds = Math.max(0, Math.ceil(remainingMillis / 1000))
    const mm = Math.floor(totalSeconds / 60)
    const ss = totalSeconds % 60
    return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}
