import {describe, expect, test} from 'vitest'
import {TimingSequenceDto, TimingSequenceEntryDto} from '@api/types.gen.ts'
import {deriveStartDisplay, sortedEntries, splitRunningEntries} from './sequenceDisplay.ts'

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
