import {describe, expect, it} from 'vitest'
import {
    CompetitionMatchDto,
    CompetitionMatchTeamDto,
    LiveDashboardMatchState,
} from '@api/types.gen.ts'
import {isDestructiveMoreAction, matchCardActions, MatchCardContext} from './matchCardActions.ts'

const team = (overrides: Partial<CompetitionMatchTeamDto> = {}): CompetitionMatchTeamDto => ({
    registrationId: crypto.randomUUID(),
    teamNumber: 1,
    clubId: crypto.randomUUID(),
    clubName: 'Ruderclub Musterstadt',
    namedParticipants: [],
    startNumber: 1,
    deregistered: false,
    failed: false,
    ...overrides,
})

const match = (
    state: LiveDashboardMatchState,
    overrides: Partial<CompetitionMatchDto> = {},
): CompetitionMatchDto => {
    const teams = [team(), team({startNumber: 2})]
    return {
        id: crypto.randomUUID(),
        teams,
        weighting: 1,
        executionOrder: 1,
        activatedAt: null,
        skipped: false,
        status: {
            state,
            teamsTotal: teams.length,
            teamsScored: 0,
            teamsRaced: 0,
            teamsDeregistered: 0,
            bye: null,
        },
        ...overrides,
    }
}

const current: MatchCardContext = {isCurrentRound: true, timingSystem: 'NONE'}
const older: MatchCardContext = {isCurrentRound: false, timingSystem: 'NONE'}

describe('matchCardActions', () => {
    it('macht in der jüngsten Runde „Ergebnis eintragen" zur Primäraktion', () => {
        const actions = matchCardActions(match('UPCOMING'), current)

        expect(actions.primary).toBe('enterResults')
        expect(actions.buttons).toEqual(['activate', 'editMatch'])
    })

    it('bietet in einer älteren Runde keine Ergebnisse, kein Zurücksetzen und keinen Import', () => {
        const actions = matchCardActions(
            match('FINISHED', {
                activatedAt: '2026-08-14T10:00:00',
                finishedAt: '2026-08-14T10:10:00',
            }),
            older,
        )

        expect(actions.primary).toBeNull()
        expect(actions.buttons).toEqual(['editMatch'])
        expect(actions.more).toEqual(['startListPdf', 'startListCsv'])
    })

    it('zeigt im Zustand Klärung „Klärung aufheben" als Primäraktion, Ergebnis bleibt direkt', () => {
        const actions = matchCardActions(
            match('CLARIFICATION', {
                activatedAt: '2026-08-14T10:00:00',
                startedAt: '2026-08-14T10:01:00',
            }),
            current,
        )

        expect(actions.primary).toBe('resolveClarification')
        expect(actions.buttons).toEqual(['enterResults', 'deactivate', 'finish', 'editMatch'])
        expect(actions.more).not.toContain('setClarification')
    })

    it('zeigt für einen Lauf in Vorbereitung deaktivieren, „Läuft" und beenden', () => {
        const actions = matchCardActions(
            match('PREPARING', {activatedAt: '2026-08-14T10:00:00'}),
            current,
        )

        expect(actions.buttons).toEqual(['deactivate', 'markStarted', 'finish', 'editMatch'])
        expect(actions.more).toContain('setClarification')
        expect(actions.more[actions.more.length - 1]).toBe('reset')
    })

    it('blendet „Läuft" aus, sobald der Ist-Start gesetzt ist', () => {
        const actions = matchCardActions(
            match('RUNNING', {
                activatedAt: '2026-08-14T10:00:00',
                startedAt: '2026-08-14T10:01:00',
            }),
            current,
        )

        expect(actions.buttons).not.toContain('markStarted')
        expect(actions.buttons).toContain('finish')
    })

    it('bietet „Lauf beenden" auch ohne Aktivierung, wenn alle Boote gewertet sind', () => {
        const actions = matchCardActions(
            match('AWAITING_FINISH', {teams: [team({place: 1}), team({place: 2})]}),
            current,
        )

        expect(actions.buttons).toEqual(['finish', 'editMatch'])
        expect(actions.more).toContain('setClarification')
    })

    it('aktiviert keinen Lauf, der schon Plätze trägt', () => {
        const actions = matchCardActions(
            match('UPCOMING', {teams: [team({place: 1}), team()]}),
            current,
        )

        expect(actions.buttons).not.toContain('activate')
    })

    it('bietet für einen beendeten Lauf der jüngsten Runde Zurücknehmen und Zurücksetzen', () => {
        const actions = matchCardActions(
            match('FINISHED', {finishedAt: '2026-08-14T10:10:00'}),
            current,
        )

        expect(actions.buttons).toEqual(['editMatch'])
        expect(actions.more).toEqual([
            'resultsXls',
            'resultsRaceClocker',
            'resultsRaceClockerFile',
            'startListPdf',
            'startListCsv',
            'reopen',
            'reset',
        ])
    })

    it('bietet kein Zurücksetzen für einen unberührten Lauf', () => {
        expect(matchCardActions(match('UPCOMING'), current).more).not.toContain('reset')
    })

    it('zählt eine Zeit oder ein Ausscheiden als etwas Zurücksetzbares', () => {
        const withTime = match('UPCOMING', {teams: [team({timeString: '00:07:12.000'}), team()]})
        const withFailed = match('UPCOMING', {teams: [team({failed: true}), team()]})

        expect(matchCardActions(withTime, current).more).toContain('reset')
        expect(matchCardActions(withFailed, current).more).toContain('reset')
    })

    it('lässt bei Webscorer die RaceClocker-Wege weg', () => {
        const actions = matchCardActions(match('UPCOMING'), {
            isCurrentRound: true,
            timingSystem: 'WEBSCORER',
        })

        expect(actions.more).toEqual(['resultsXls', 'startListPdf', 'startListCsv'])
    })

    it('kennzeichnet nur das Zurücksetzen als zerstörerisch', () => {
        expect(isDestructiveMoreAction('reset')).toBe(true)
        expect(isDestructiveMoreAction('reopen')).toBe(false)
    })
})
