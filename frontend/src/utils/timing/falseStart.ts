import {TimingMatchDto, TimingSequenceDto} from '@api/types.gen.ts'
import {ToneStep, toneSequenceTotalMillis} from './tonePlan.ts'

/**
 * Fehlstart-Erkennung der Zeitnahme: WANN der konfigurierte Fehlstart-Ton fällig ist — als reine
 * Funktionen (Muster `tonePlan.ts`), die Boards halten nur einen „zuletzt gespielt"-Zeitstempel.
 *
 * Die zwei Fehlstart-Gesten des Systems:
 *
 * 1. **Abbruch einer LAUFENDEN Sequenz** (`abortTimingSequence`): der Starter bricht ab, während
 *    Boote im Countdown stehen oder gerade gestartet sind. Erreicht die Boards als
 *    `sequenceChanged` mit Zustand ABORTED — [isSequenceAbortFalseStart] erkennt genau den
 *    Übergang RUNNING → ABORTED derselben Sequenz. Der Abbruch einer nur scharfgestellten
 *    (ARMED) Sequenz ist bewusst KEIN Fehlstart: da ist noch niemand losgefahren, es gibt nichts
 *    zurückzurufen.
 *
 * 2. **Rücknahme eines Versuchs** (`retractMatchAttempt`, „Start zurücknehmen und neu starten"):
 *    erreicht die Boards als eigene `attemptRetracted`-Nachricht (die einzelnen
 *    `timeMarkRetracted`-Echos sind absichtlich NICHT der Auslöser — die feuern auch bei der
 *    Einzelmarken-Korrektur in der Zeitenliste, und die ist ausdrücklich kein Fehlstart).
 *    [isAttemptRetractionFalseStart] prüft, ob die zurückgenommene Partie zur Sequenz gehört,
 *    die das Board GERADE zeigt.
 *
 * Gemeinsame Regel („nur die aktive/fokussierte Sequenz"): Der Ton spielt ausschließlich, wenn
 * die betroffene Partie die Sequenz ist, die das Board aktuell führt — inklusive einer schon
 * beendeten (DONE/ABORTED), deren Zusammenfassung noch steht, denn genau in diesem Fenster wird
 * ein Fehlstart typischerweise erklärt. Wurde die Zusammenfassung weggeklickt (Sequenz
 * `undefined`) oder betrifft die Rücknahme einen älteren Lauf, bleibt es still — Aufräumarbeiten
 * im Leitstand dürfen den Startbereich nicht beschallen. Die Nie-nachholen-Regel (verdeckter Tab
 * bleibt still) prüft der Aufrufer über `document.visibilityState`, weil sie kein reiner
 * Funktionswert ist.
 */

/** Die `attemptRetracted`-WebSocket-Nachricht, wie sie das Backend sendet. */
export type AttemptRetractedInfo = {
    competitionSetupMatch: string
    /** Die Teams, deren aktive Marken die Rücknahme zurückgenommen hat (kann leer sein). */
    competitionMatchTeams: string[]
}

/**
 * Fehlstart-Geste 1: Übergang RUNNING → ABORTED derselben Sequenz. `prev` ist der Stand des
 * Boards VOR der eingespielten `sequenceChanged`-Nachricht — nur wer den Lauf wirklich laufen
 * sah, ruft zurück; ein Board, das erst nach dem Abbruch dazukommt (prev undefined oder andere
 * Sequenz), bleibt still.
 */
export function isSequenceAbortFalseStart(
    prev: TimingSequenceDto | undefined,
    next: TimingSequenceDto,
): boolean {
    return (
        prev !== undefined &&
        prev.id === next.id &&
        prev.state === 'RUNNING' &&
        next.state === 'ABORTED'
    )
}

/**
 * Fehlstart-Geste 2: Versuchs-Rücknahme einer Partie, die die aktuell geführte Sequenz des
 * Boards betrifft. Der Treffer läuft über zwei Wege, weil die Nachricht nur die Teams der
 * tatsächlich zurückgenommenen Marken trägt:
 *
 * - direkt: eines der gemeldeten Teams steht in den Sequenz-Einträgen;
 * - über die Startliste: die gemeldete Partie wird in [matches] gefunden und EINES ihrer Teams
 *   steht in der Sequenz — das fängt den Randfall, dass alle Marken schon einzeln zurückgenommen
 *   waren und die Rücknahme nur noch den Ist-Start-Stempel räumt (Teamliste dann leer).
 *
 * Ohne geführte Sequenz (weggeklickt oder nie gesehen) immer false.
 */
export function isAttemptRetractionFalseStart(
    info: AttemptRetractedInfo,
    matches: readonly TimingMatchDto[],
    sequence: TimingSequenceDto | undefined,
): boolean {
    if (sequence === undefined) return false
    const sequenceTeams = new Set(sequence.entries.map(entry => entry.competitionMatchTeam))
    if (info.competitionMatchTeams.some(team => sequenceTeams.has(team))) return true
    const match = matches.find(
        candidate => candidate.competitionSetupMatch === info.competitionSetupMatch,
    )
    return match !== undefined && match.teams.some(team => sequenceTeams.has(team.competitionMatchTeam))
}

/**
 * Entprellung: „Sequenz abbrechen" gefolgt von „Start zurücknehmen" (der Neustart-Griff macht
 * genau das in einem Zug) sind ZWEI Auslöser für EINEN Fehlstart — solange die Folge noch klingt,
 * spielt keine zweite an. Das Sperrfenster ist die Gesamtlänge der GANZEN Folge (letzter Ton
 * einschließlich Ausklingen, siehe [toneSequenceTotalMillis]) — nicht die Länge eines einzelnen
 * Tons: seit „kurz-kurz-lang" wäre das nur der erste Schlag, und der zweite Auslöser fiele mitten
 * in den laufenden Rückruf. Kürzer ließe Folgen ineinanderlaufen, länger verschluckte einen echten
 * zweiten Fehlstart kurz darauf.
 */
export function falseStartSuppressMillis(sequence: readonly ToneStep[]): number {
    return toneSequenceTotalMillis(sequence)
}

/** Ob jetzt gespielt werden darf: noch nie gespielt, oder das Sperrfenster ist verstrichen. */
export function shouldPlayFalseStart(
    lastPlayedAtMillis: number | null,
    nowMillis: number,
    suppressMillis: number,
): boolean {
    return lastPlayedAtMillis === null || nowMillis - lastPlayedAtMillis >= suppressMillis
}
