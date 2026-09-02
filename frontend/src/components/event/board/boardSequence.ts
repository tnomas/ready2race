import {AthleteBoardMatch, BoardSequenceDto, BoardViewDto} from '@api/types.gen.ts'

/**
 * Die Startsequenz auf den Board-Kacheln — reine Ableitungen über `BoardViewDto.sequence`,
 * damit sie ohne Rendering prüfbar sind. Die Sequenz reist mit der Board-Sicht (öffentlicher
 * Poll bzw. Board-Kanal), weil der Zeitnahme-Kanal einem Board nicht offensteht.
 */

/** Die Sequenz der Board-Sicht, sofern [matchId] darin steckt — sonst null. */
export const sequenceForMatch = (
    view: Pick<BoardViewDto, 'sequence'>,
    matchId: string,
): BoardSequenceDto | null => {
    const sequence = view.sequence
    if (!sequence || !sequence.matchIds.includes(matchId)) return null
    return sequence
}

/**
 * Die drei Zeitpunkte, die `streamClockState` für den Countdown braucht — leer, wenn der Lauf
 * nicht in der Sequenz steckt. Ein gestempelter Start hat dort ohnehin Vorrang.
 */
export const sequenceClockArgs = (
    view: Pick<BoardViewDto, 'sequence'>,
    match: AthleteBoardMatch | null,
): {startedAt: string | null; firesAt: string | null; pausedAt: string | null} => {
    const sequence = match ? sequenceForMatch(view, match.matchId) : null
    return {
        startedAt: sequence?.startedAt ?? null,
        firesAt: sequence?.firesAt ?? null,
        pausedAt: sequence?.pausedAt ?? null,
    }
}

export type SequenceLine =
    | {kind: 'armed'}
    | {kind: 'countdown'; remainingMs: number; paused: boolean}

/**
 * Die Zeile am Kopf einer Lauf-Kachel, solange der Lauf noch keinen Start trägt: „Startsequenz
 * scharf", oder der Countdown auf den Feuerzeitpunkt (bei Pause eingefroren auf
 * `firesAt − pausedAt`, eine reine Serverzeit-Differenz). Nach dem gestempelten Start sagt die
 * Kachel wie bisher „gestartet 14:32" — dann ist hier nichts mehr zu melden.
 *
 * [serverNowMs] ist die servergeankerte Uhr der Seite (`useServerClock`), keine Geräteuhr.
 */
export const sequenceLineFor = (
    sequence: BoardSequenceDto | null | undefined,
    match: AthleteBoardMatch,
    serverNowMs: number,
): SequenceLine | null => {
    if (!sequence || match.actualStartTime != null || !sequence.matchIds.includes(match.matchId)) {
        return null
    }
    if (sequence.state === 'ARMED') return {kind: 'armed'}
    if (sequence.firesAt == null) return null
    const fireMs = new Date(sequence.firesAt).getTime()
    if (sequence.state === 'PAUSED') {
        const pausedMs =
            sequence.pausedAt != null ? new Date(sequence.pausedAt).getTime() : serverNowMs
        return {kind: 'countdown', remainingMs: Math.max(0, fireMs - pausedMs), paused: true}
    }
    if (sequence.state === 'RUNNING') {
        return {kind: 'countdown', remainingMs: Math.max(0, fireMs - serverNowMs), paused: false}
    }
    return null
}
