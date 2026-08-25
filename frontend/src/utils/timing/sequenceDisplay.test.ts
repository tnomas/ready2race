import {describe, expect, test} from 'vitest'
import {
    TimingMatchDto,
    TimingMatchTeamDto,
    TimingSequenceDto,
    TimingSequenceEntryDto,
} from '@api/types.gen.ts'
import {
    deriveStartDisplay,
    nextMatchAnnouncement,
    sortedEntries,
    splitRunningEntries,
} from './sequenceDisplay.ts'

const entry = (overrides: Partial<TimingSequenceEntryDto>): TimingSequenceEntryDto => ({
    id: overrides.id ?? crypto.randomUUID(),
    competitionMatchTeam: overrides.competitionMatchTeam ?? crypto.randomUUID(),
    position: overrides.position ?? 0,
    status: overrides.status ?? 'PENDING',
    ...overrides,
})

const sequence = (overrides: Partial<TimingSequenceDto>): TimingSequenceDto => ({
    id: overrides.id ?? crypto.randomUUID(),
    event: crypto.randomUUID(),
    station: crypto.randomUUID(),
    mode: 'INTERVAL',
    leadInMillis: 10_000,
    state: 'RUNNING',
    entries: [],
    ...overrides,
})

describe('sortedEntries', () => {
    test('sortiert nach Position und mutiert die Eingabe nicht', () => {
        const input = [
            entry({id: 'c', position: 2}),
            entry({id: 'a', position: 0}),
            entry({id: 'b', position: 1}),
        ]
        const seq = sequence({entries: input})
        const before = [...input]

        expect(sortedEntries(seq).map(e => e.id)).toEqual(['a', 'b', 'c'])
        expect(input).toEqual(before)
    })
})

describe('splitRunningEntries', () => {
    test('naechster = erster PENDING-Eintrag, danach die weiteren, erledigte separat', () => {
        const seq = sequence({
            entries: [
                entry({id: 'started', position: 0, status: 'STARTED', plannedStartMillis: 1_000}),
                entry({id: 'skipped', position: 1, status: 'SKIPPED'}),
                entry({id: 'next', position: 2, status: 'PENDING', plannedStartMillis: 3_000}),
                entry({id: 'later', position: 3, status: 'PENDING', plannedStartMillis: 4_000}),
            ],
        })

        const split = splitRunningEntries(seq)

        expect(split.next?.id).toBe('next')
        expect(split.following.map(e => e.id)).toEqual(['later'])
        expect(split.settled.map(e => e.id)).toEqual(['started', 'skipped'])
        expect(split.targetMillis).toBe(3_000)
    })

    test('Countdown-Ziel faellt auf startedAtMillis zurueck, wenn der naechste Eintrag keine geplante Zeit hat', () => {
        const seq = sequence({
            startedAtMillis: 42_000,
            entries: [entry({id: 'next', position: 0, status: 'PENDING'})],
        })

        expect(splitRunningEntries(seq).targetMillis).toBe(42_000)
    })

    test('ohne PENDING-Eintraege gibt es keinen naechsten und kein Countdown-Ziel aus Eintraegen', () => {
        const seq = sequence({
            startedAtMillis: 42_000,
            entries: [entry({position: 0, status: 'STARTED', plannedStartMillis: 1_000})],
        })

        const split = splitRunningEntries(seq)

        expect(split.next).toBeUndefined()
        expect(split.following).toEqual([])
        // Der Fallback greift nur fuer einen existierenden naechsten Eintrag - ein leerer Rest
        // laeuft in den "finishing"-Zustand, nicht in einen Countdown auf den Sequenzstart.
        expect(split.targetMillis).toBeUndefined()
    })
})

describe('deriveStartDisplay', () => {
    test('ohne Sequenz: IDLE', () => {
        expect(deriveStartDisplay(undefined)).toEqual({kind: 'IDLE'})
    })

    test('ARMED: Eintraege in Positionsreihenfolge', () => {
        const seq = sequence({
            state: 'ARMED',
            entries: [entry({id: 'b', position: 1}), entry({id: 'a', position: 0})],
        })

        const view = deriveStartDisplay(seq)

        expect(view.kind).toBe('ARMED')
        if (view.kind === 'ARMED') {
            expect(view.entries.map(e => e.id)).toEqual(['a', 'b'])
        }
    })

    test('RUNNING mit PENDING-Eintraegen: Countdown-Sicht', () => {
        const seq = sequence({
            state: 'RUNNING',
            entries: [
                entry({id: 'next', position: 0, status: 'PENDING', plannedStartMillis: 9_000}),
                entry({id: 'later', position: 1, status: 'PENDING'}),
            ],
        })

        const view = deriveStartDisplay(seq)

        expect(view.kind).toBe('RUNNING')
        if (view.kind === 'RUNNING') {
            expect(view.next.id).toBe('next')
            expect(view.following.map(e => e.id)).toEqual(['later'])
            expect(view.targetMillis).toBe(9_000)
        }
    })

    test('RUNNING ohne PENDING-Eintraege: FINISHING', () => {
        const seq = sequence({
            state: 'RUNNING',
            entries: [entry({position: 0, status: 'STARTED', plannedStartMillis: 1_000})],
        })

        expect(deriveStartDisplay(seq).kind).toBe('FINISHING')
    })

    test('DONE und ABORTED werden als Abschluss-Sicht mit Eintraegen geliefert', () => {
        const done = deriveStartDisplay(sequence({state: 'DONE', entries: [entry({position: 0})]}))
        const aborted = deriveStartDisplay(sequence({state: 'ABORTED'}))

        expect(done.kind).toBe('SETTLED')
        if (done.kind === 'SETTLED') {
            expect(done.state).toBe('DONE')
            expect(done.entries).toHaveLength(1)
        }
        expect(aborted.kind).toBe('SETTLED')
        if (aborted.kind === 'SETTLED') {
            expect(aborted.state).toBe('ABORTED')
        }
    })
})

const matchTeam = (
    startNumber: number,
    overrides: Partial<TimingMatchTeamDto> = {},
): TimingMatchTeamDto => ({
    competitionMatchTeam: `team-${startNumber}`,
    startNumber,
    started: false,
    finished: false,
    ...overrides,
})

const match = (
    id: string,
    phase: TimingMatchDto['phase'],
    progress: TimingMatchDto['progress'],
    overrides: Partial<TimingMatchDto> = {},
): TimingMatchDto => ({
    competitionSetupMatch: id,
    competition: 'competition',
    round: 'round',
    phase,
    progress,
    teams: [matchTeam(1), matchTeam(2)],
    ...overrides,
})

describe('deriveStartDisplay (PAUSED)', () => {
    test('PAUSED zeigt den naechsten Eintrag, die Folgenden und den Pausenbeginn', () => {
        const seq = sequence({
            state: 'PAUSED',
            pausedAtMillis: 5_000,
            entries: [
                entry({id: 'started', position: 0, status: 'STARTED'}),
                entry({id: 'next', position: 1, status: 'PENDING', plannedStartMillis: 9_000}),
                entry({id: 'later', position: 2, status: 'PENDING'}),
            ],
        })

        const view = deriveStartDisplay(seq)

        expect(view.kind).toBe('PAUSED')
        if (view.kind === 'PAUSED') {
            expect(view.next?.id).toBe('next')
            expect(view.following.map(e => e.id)).toEqual(['later'])
            expect(view.settled.map(e => e.id)).toEqual(['started'])
            expect(view.pausedAtMillis).toBe(5_000)
        }
    })

    test('PAUSED ohne PENDING-Rest bleibt PAUSED, aber ohne naechsten Eintrag', () => {
        const view = deriveStartDisplay(
            sequence({state: 'PAUSED', entries: [entry({position: 0, status: 'STARTED'})]}),
        )

        expect(view.kind).toBe('PAUSED')
        if (view.kind === 'PAUSED') expect(view.next).toBeUndefined()
    })
})

describe('nextMatchAnnouncement', () => {
    test('bevorzugt den aufgerufenen, noch nicht gestarteten Lauf', () => {
        const result = nextMatchAnnouncement([
            match('done', 'DONE', 'FINISHED'),
            match('called', 'ACTIVE', 'OPEN'),
            match('later', 'OPEN', 'OPEN'),
        ])

        expect(result?.match.competitionSetupMatch).toBe('called')
        expect(result?.inPreparation).toBe(true)
    })

    test('ein aufgerufener Lauf, der schon startet, zaehlt nicht mehr als Ankuendigung', () => {
        const result = nextMatchAnnouncement([
            match('running', 'ACTIVE', 'STARTING'),
            match('later', 'OPEN', 'OPEN'),
        ])

        expect(result?.match.competitionSetupMatch).toBe('later')
        // Notnagel, damit der Bildschirm nicht leer steht - aber nicht "in Vorbereitung", und
        // deshalb darf er die Zusammenfassung des eben gefahrenen Laufs nicht wegdruecken.
        expect(result?.inPreparation).toBe(false)
    })

    test('ohne offene Partie gibt es keine Ankuendigung', () => {
        expect(nextMatchAnnouncement([match('done', 'DONE', 'FINISHED')])).toBeUndefined()
        expect(nextMatchAnnouncement([])).toBeUndefined()
    })

    test('erstes Boot = kleinste Startnummer der noch nicht gestarteten Boote', () => {
        const result = nextMatchAnnouncement([
            match('called', 'ACTIVE', 'OPEN', {
                teams: [matchTeam(3), matchTeam(1, {started: true}), matchTeam(2)],
            }),
        ])

        expect(result?.firstTeam?.startNumber).toBe(2)
    })

    test('sind alle Boote schon unterwegs, zaehlt wieder das ganze Feld', () => {
        const result = nextMatchAnnouncement([
            match('called', 'ACTIVE', 'OPEN', {
                teams: [matchTeam(2, {started: true}), matchTeam(1, {started: true})],
            }),
        ])

        expect(result?.firstTeam?.startNumber).toBe(1)
    })

    test('eine Partie ohne Boote kuendigt sich ohne erstes Boot an', () => {
        const result = nextMatchAnnouncement([match('called', 'ACTIVE', 'OPEN', {teams: []})])

        expect(result?.match.competitionSetupMatch).toBe('called')
        expect(result?.firstTeam).toBeUndefined()
    })
})
