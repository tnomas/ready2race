import {
    SequenceState,
    TimingMatchDto,
    TimingMatchTeamDto,
    TimingSequenceDto,
    TimingSequenceEntryDto,
} from '@api/types.gen.ts'

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
    | {
          kind: 'PAUSED'
          /** Das Boot, das nach dem Fortsetzen als Erstes dran ist; undefined am Sequenzende. */
          next: TimingSequenceEntryDto | undefined
          following: TimingSequenceEntryDto[]
          settled: TimingSequenceEntryDto[]
          /** Beginn der laufenden Pause (Server-Epoch-Millis), falls der Server ihn mitschickt. */
          pausedAtMillis: number | undefined
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
        case 'PAUSED': {
            // Bewusst KEIN Countdown: die geplanten Startzeiten der Einträge tragen die bereits
            // aufgelaufene Pausendauer zwar schon in sich, aber sie wandern beim Fortsetzen noch
            // einmal um die restliche Pause weiter. Ein währenddessen weiterlaufender Countdown
            // zählte also auf eine Uhrzeit herunter, die nicht gilt — am Start ist das die
            // gefährlichste aller Anzeigen. Stattdessen bleibt sichtbar, WER als Nächstes dran
            // ist, und der Bildschirm sagt unübersehbar, dass gerade nichts läuft.
            const split = splitRunningEntries(sequence)
            return {
                kind: 'PAUSED',
                next: split.next,
                following: split.following,
                settled: split.settled,
                pausedAtMillis: sequence.pausedAtMillis,
            }
        }
        case 'DONE':
        case 'ABORTED':
            return {kind: 'SETTLED', state: sequence.state, entries: sortedEntries(sequence)}
    }
}

/**
 * Die Ankündigung des nächsten Laufs, die der Startbildschirm zwischen zwei Sequenzen zeigt.
 *
 * `inPreparation` unterscheidet die beiden Herleitungen, und genau daran hängt eine fachliche
 * Regel: nur ein Lauf, der wirklich AUFGERUFEN ist (`phase === 'ACTIVE'`, also mit gesetztem
 * `activated_at`, und noch nicht gestartet), löst die Zusammenfassung des eben beendeten Laufs ab.
 * Der Rückfall auf „irgendein noch offener Lauf" (`inPreparation: false`) ist nur ein Notnagel für
 * einen Bildschirm, der sonst leer dastünde — er darf die Zusammenfassung nicht wegdrücken, denn
 * die nächste offene Partie gibt es fast immer, und dann wäre das Ergebnis des eben gefahrenen
 * Laufs nie zu lesen.
 */
export type NextMatchAnnouncement = {
    match: TimingMatchDto
    /**
     * Das Boot, das die kommende Sequenz als Erstes startet — undefined nur bei einer Partie ganz
     * ohne Boote (Freilos-Sonderfälle).
     */
    firstTeam: TimingMatchTeamDto | undefined
    /** True, wenn der Lauf aufgerufen ist („in Vorbereitung"), nicht bloß der nächste offene. */
    inPreparation: boolean
}

/**
 * Welches Boot eine Startsequenz dieser Partie als Erstes aufrufen würde.
 *
 * Dieselbe Regel wie `sequenceRequestFromMode` in `matchBoard.ts`: bereits gestartete Boote
 * (Nachzügler-Fall) fallen heraus, der Rest startet in Startnummern-Reihenfolge. Die Regel steht
 * hier bewusst noch einmal, statt importiert zu werden: `matchBoard.ts` hängt über `BoardMark` am
 * Board-Zustands-Hook und damit an React — diese Datei soll rein bleiben und ohne DOM testbar sein.
 * Fällt am Ende doch alles heraus (jedes Boot schon unterwegs), zählt wieder das ganze Feld: eine
 * Ankündigung ohne Boot wäre auf dem Bildschirm am Steg die schlechtere Auskunft.
 */
function firstSequenceTeam(match: TimingMatchDto): TimingMatchTeamDto | undefined {
    const startable = match.teams.filter(team => !team.started)
    const pool = startable.length > 0 ? startable : match.teams
    return [...pool].sort((a, b) => a.startNumber - b.startNumber)[0]
}

/**
 * Der nächste Lauf für die Ankündigung zwischen zwei Sequenzen — wörtlich nach der fachlichen
 * Vorgabe: „Der nächste Lauf ist in der Uhrzeit der nächste. Das ist der, der in Vorbereitung ist,
 * wenn der alte abgehakt ist."
 *
 * Also zuerst die aufgerufene, noch nicht gestartete Partie (`phase === 'ACTIVE'` kommt aus
 * `activated_at`, `progress === 'OPEN'` heißt, es liegt noch keine Startmarke und keine Sequenz
 * darauf). Gibt es die nicht — niemand hat aufgerufen, der Bildschirm stünde sonst leer —, die
 * erste offene Partie in gelieferter Reihenfolge; `/timing/matches` liefert bereits chronologisch,
 * „die erste" ist damit auch „die in der Uhrzeit nächste".
 */
export function nextMatchAnnouncement(
    matches: TimingMatchDto[],
): NextMatchAnnouncement | undefined {
    const prepared = matches.find(match => match.phase === 'ACTIVE' && match.progress === 'OPEN')
    const match = prepared ?? matches.find(match => match.progress === 'OPEN')
    if (match === undefined) return undefined
    return {
        match,
        firstTeam: firstSequenceTeam(match),
        inPreparation: prepared !== undefined,
    }
}

export function formatCountdown(remainingMillis: number): string {
    const totalSeconds = Math.max(0, Math.ceil(remainingMillis / 1000))
    const mm = Math.floor(totalSeconds / 60)
    const ss = totalSeconds % 60
    return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}
