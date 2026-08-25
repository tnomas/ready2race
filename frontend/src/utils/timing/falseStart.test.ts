import {describe, expect, test} from 'vitest'
import {TimingMatchDto, TimingSequenceDto} from '@api/types.gen.ts'
import {
    isAttemptRetractionFalseStart,
    isSequenceAbortFalseStart,
    falseStartSuppressMillis,
    shouldPlayFalseStart,
} from './falseStart.ts'
import {DEFAULT_FALSE_START_SEQUENCE} from './tonePlan.ts'

const sequence = (id: string, state: string, teamIds: string[]): TimingSequenceDto =>
    ({
        id,
        event: 'e1',
        station: 's1',
        mode: 'INTERVAL',
        leadInMillis: 10_000,
        state,
        entries: teamIds.map((teamId, position) => ({
            id: `entry-${teamId}`,
            competitionMatchTeam: teamId,
            position,
            status: 'PENDING',
        })),
    }) as unknown as TimingSequenceDto

const match = (id: string, teamIds: string[]): TimingMatchDto =>
    ({
        competitionSetupMatch: id,
        teams: teamIds.map(teamId => ({
            competitionMatchTeam: teamId,
            startNumber: 1,
            teamName: null,
            clubName: null,
            started: false,
            finished: false,
        })),
    }) as unknown as TimingMatchDto

describe('isSequenceAbortFalseStart', () => {
    test('RUNNING -> ABORTED derselben Sequenz ist der Fehlstart-Abbruch', () => {
        const prev = sequence('seq1', 'RUNNING', ['t1'])
        const next = sequence('seq1', 'ABORTED', ['t1'])
        expect(isSequenceAbortFalseStart(prev, next)).toBe(true)
    })

    test('Abbruch einer nur scharfgestellten Sequenz ist kein Fehlstart', () => {
        const prev = sequence('seq1', 'ARMED', ['t1'])
        const next = sequence('seq1', 'ABORTED', ['t1'])
        expect(isSequenceAbortFalseStart(prev, next)).toBe(false)
    })

    test('ohne vorherigen Stand (Board kam erst nach dem Abbruch dazu) bleibt es still', () => {
        expect(isSequenceAbortFalseStart(undefined, sequence('seq1', 'ABORTED', ['t1']))).toBe(false)
    })

    test('eine ANDERE Sequenz, die abgebrochen ankommt, spielt nichts', () => {
        const prev = sequence('seq1', 'RUNNING', ['t1'])
        const next = sequence('seq2', 'ABORTED', ['t2'])
        expect(isSequenceAbortFalseStart(prev, next)).toBe(false)
    })

    test('normale Uebergaenge (RUNNING -> DONE, RUNNING -> RUNNING) sind kein Fehlstart', () => {
        const prev = sequence('seq1', 'RUNNING', ['t1'])
        expect(isSequenceAbortFalseStart(prev, sequence('seq1', 'DONE', ['t1']))).toBe(false)
        expect(isSequenceAbortFalseStart(prev, sequence('seq1', 'RUNNING', ['t1']))).toBe(false)
    })
})

describe('isAttemptRetractionFalseStart', () => {
    const info = (matchId: string, teams: string[]) => ({
        competitionSetupMatch: matchId,
        competitionMatchTeams: teams,
    })

    test('Team der Ruecknahme steht in der gefuehrten Sequenz -> Fehlstart', () => {
        const seq = sequence('seq1', 'DONE', ['t1', 't2'])
        expect(isAttemptRetractionFalseStart(info('m1', ['t2']), [], seq)).toBe(true)
    })

    test('Ruecknahme einer fremden, aelteren Partie bleibt still (Aufraeumarbeiten)', () => {
        const seq = sequence('seq1', 'RUNNING', ['t1', 't2'])
        const matches = [match('m1', ['t1', 't2']), match('m9', ['t9'])]
        expect(isAttemptRetractionFalseStart(info('m9', ['t9']), matches, seq)).toBe(false)
    })

    test('ohne gefuehrte Sequenz (weggeklickt oder nie gesehen) bleibt es still', () => {
        expect(isAttemptRetractionFalseStart(info('m1', ['t1']), [match('m1', ['t1'])], undefined)).toBe(
            false,
        )
    })

    test('leere Teamliste: der Treffer laeuft ueber die Partie in der Startliste', () => {
        // Randfall: alle Marken waren schon einzeln zurueckgenommen, die Versuchs-Ruecknahme
        // raeumt nur noch den Ist-Start-Stempel — die Nachricht traegt dann keine Teams.
        const seq = sequence('seq1', 'DONE', ['t1', 't2'])
        const matches = [match('m1', ['t1', 't2'])]
        expect(isAttemptRetractionFalseStart(info('m1', []), matches, seq)).toBe(true)
        expect(isAttemptRetractionFalseStart(info('m9', []), matches, seq)).toBe(false)
    })
})

describe('Entprellung', () => {
    test('Sperrfenster = Gesamtlaenge der ganzen FOLGE, nicht des ersten Tons', () => {
        expect(falseStartSuppressMillis([{offsetMillis: 0, frequencyHz: 440, durationMillis: 3000}])).toBe(3000)
        expect(
            falseStartSuppressMillis([
                {offsetMillis: 0, frequencyHz: 440, durationMillis: 3000, releaseMillis: 1500},
            ]),
        ).toBe(4500)
        // Der eigentliche Punkt seit kurz-kurz-lang: haenge das Fenster an den ERSTEN Ton (300 ms),
        // fiele der zweite Ausloeser mitten in den laufenden Rueckruf.
        expect(falseStartSuppressMillis(DEFAULT_FALSE_START_SEQUENCE)).toBe(2700)
    })

    test('erster Ausloeser spielt immer, ein zweiter erst nach dem Sperrfenster', () => {
        expect(shouldPlayFalseStart(null, 10_000, 3000)).toBe(true)
        // Abbruch + direkt folgende Versuchs-Ruecknahme (der Neustart-Griff): EIN Ton.
        expect(shouldPlayFalseStart(10_000, 10_050, 3000)).toBe(false)
        expect(shouldPlayFalseStart(10_000, 12_999, 3000)).toBe(false)
        // Ein echter zweiter Fehlstart nach abgeklungenem Ton spielt wieder.
        expect(shouldPlayFalseStart(10_000, 13_000, 3000)).toBe(true)
    })
})
