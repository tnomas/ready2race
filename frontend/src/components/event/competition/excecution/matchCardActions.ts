import {CompetitionMatchDto} from '@api/types.gen.ts'
import {ExecutionTimingSystem, MatchResultOption, matchResultOptions} from './matchResultOptions.ts'

/** Aktionen, die als Knopf direkt auf der Lauf-Karte stehen. */
export type MatchCardButton =
    | 'resolveClarification'
    | 'enterResults'
    | 'activate'
    | 'deactivate'
    | 'markStarted'
    | 'finish'
    | 'editMatch'

/** Seltene Aktionen im Menü „Weitere Aktionen"; `reset` ist zerstörerisch und steht immer zuletzt. */
export type MatchMoreAction =
    | 'resultsXls'
    | 'resultsRaceClocker'
    | 'resultsRaceClockerFile'
    | 'startListPdf'
    | 'startListCsv'
    | 'setClarification'
    | 'reopen'
    | 'reset'

export type MatchCardActions = {
    /** Die eine hervorgehobene Aktion der Karte (gefüllter Knopf) – oder keine. */
    primary: MatchCardButton | null
    /** Weitere direkte Knöpfe in Anzeigereihenfolge, ohne [primary]. */
    buttons: MatchCardButton[]
    /** Einträge des Überlaufmenüs in Anzeigereihenfolge. */
    more: MatchMoreAction[]
}

export type MatchCardContext = {
    /** Jüngste Runde (Index 0 der absteigend sortierten Runden): nur dort Ergebnisse und Reset. */
    isCurrentRound: boolean
    timingSystem: ExecutionTimingSystem
}

const hasPlaces = (match: CompetitionMatchDto): boolean =>
    match.teams.some(team => team.place !== null && team.place !== undefined)

/** Ob ein Zurücksetzen etwas bewirkt – ein unberührter Lauf bekommt keinen wirkungslosen Eintrag. */
const hasExecutionData = (match: CompetitionMatchDto): boolean =>
    match.activatedAt != null ||
    match.startedAt != null ||
    match.finishedAt != null ||
    match.teams.some(team => team.place != null || team.failed || team.timeString != null)

const resultImportActions: Partial<Record<MatchResultOption, MatchMoreAction>> = {
    XLS: 'resultsXls',
    RACECLOCKER: 'resultsRaceClocker',
    RACECLOCKER_FILE: 'resultsRaceClockerFile',
}

/**
 * Welche Aktionen eine Lauf-Karte der Durchführung anbietet und wo sie stehen.
 *
 * Reine Verteilung: Die Bedingungen sind dieselben wie vor dem Umbau der Karte (Knopfleiste plus
 * zwei Auswahlmenüs), der Zustand selbst kommt unverändert aus `match.status` bzw. den
 * Zeitstempeln des Laufs – hier wird nichts neu abgeleitet.
 *
 * Primär ist je Zustand genau eine Aktion: im Zustand Klärung „Klärung aufheben", sonst in der
 * jüngsten Runde „Ergebnis eintragen" (öffnet das Formular direkt). Statusübergänge (aktivieren,
 * „Läuft", beenden) und „Partie bearbeiten" (Startzeit, Startnummern) bleiben direkte Knöpfe, weil
 * sie am Renntag ständig gebraucht werden. Alles Seltene wandert ins Menü.
 */
export const matchCardActions = (
    match: CompetitionMatchDto,
    {isCurrentRound, timingSystem}: MatchCardContext,
): MatchCardActions => {
    const state = match.status.state
    const finished = match.finishedAt != null
    const activated = match.activatedAt != null
    const inClarification = state === 'CLARIFICATION'

    const primary: MatchCardButton | null = inClarification
        ? 'resolveClarification'
        : isCurrentRound
          ? 'enterResults'
          : null

    const buttons: MatchCardButton[] = []
    if (isCurrentRound && primary !== 'enterResults') {
        buttons.push('enterResults')
    }
    if (!finished && !activated && !hasPlaces(match)) {
        buttons.push('activate')
    }
    if (!finished && activated) {
        buttons.push('deactivate')
    }
    if (!finished && activated && match.startedAt == null) {
        buttons.push('markStarted')
    }
    if (!finished && (activated || state === 'AWAITING_FINISH')) {
        buttons.push('finish')
    }
    buttons.push('editMatch')

    const more: MatchMoreAction[] = []
    if (isCurrentRound) {
        matchResultOptions(timingSystem).forEach(option => {
            const action = resultImportActions[option]
            if (action) more.push(action)
        })
    }
    more.push('startListPdf', 'startListCsv')
    if (
        !inClarification &&
        (state === 'RUNNING' || state === 'PREPARING' || state === 'AWAITING_FINISH')
    ) {
        more.push('setClarification')
    }
    if (finished && isCurrentRound) {
        more.push('reopen')
    }
    if (isCurrentRound && hasExecutionData(match)) {
        more.push('reset')
    }

    return {primary, buttons, more}
}

/** Zerstörerische Menüeinträge: abgesetzt (Trennlinie davor) und in Fehlerfarbe. */
export const isDestructiveMoreAction = (action: MatchMoreAction): boolean => action === 'reset'
