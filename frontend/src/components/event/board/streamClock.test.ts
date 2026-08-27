import {describe, expect, it} from 'vitest'
import {formatCountdown, formatElapsed, streamClockState} from './streamClock.ts'
import {AthleteBoardMatch, AthleteBoardTeam} from '@api/types.gen.ts'

const team = (overrides: Partial<AthleteBoardTeam>): AthleteBoardTeam =>
    ({startNumber: 1, timeString: null, failed: false, ...overrides}) as AthleteBoardTeam

const matchWith = (overrides: Partial<AthleteBoardMatch>): AthleteBoardMatch =>
    ({matchName: 'VF1', teams: [], actualStartTime: null, ...overrides}) as AthleteBoardMatch

describe('streamClockState', () => {
    it('ist hidden ohne Lauf', () => {
        expect(streamClockState(null, 0, 0)).toEqual({phase: 'hidden'})
    })

    it('ist hidden ohne actualStartTime', () => {
        const match = matchWith({actualStartTime: null, teams: [team({})]})
        expect(streamClockState(match, Date.now(), 0)).toEqual({phase: 'hidden'})
    })

    it('läuft mit korrektem elapsedMs inklusive Versatz-Korrektur', () => {
        const start = new Date('2026-08-13T10:00:00.000Z')
        const match = matchWith({
            actualStartTime: start.toISOString(),
            teams: [team({timeString: null})],
        })
        // Client-Uhr 5 s nach Start; Server 2 s hinter der Client-Uhr (clockOffsetMs =
        // clientNow - serverTime = 2000) → tatsächlich sind nur 3 s Server-Zeit vergangen.
        const clientNowMs = start.getTime() + 5000
        const clockOffsetMs = 2000
        const state = streamClockState(match, clientNowMs, clockOffsetMs)
        expect(state).toEqual({phase: 'running', elapsedMs: 3000})
    })

    it('friert ein, wenn alle Boote gewertet oder failed sind', () => {
        const start = new Date('2026-08-13T10:00:00.000Z')
        const match = matchWith({
            actualStartTime: start.toISOString(),
            teams: [team({timeString: '1:23.4'}), team({startNumber: 2, failed: true})],
        })
        const clientNowMs = start.getTime() + 10000
        const state = streamClockState(match, clientNowMs, 0)
        expect(state).toEqual({phase: 'frozen', elapsedMs: 10000})
    })

    it('läuft weiter, solange mindestens ein Boot ohne Zeit und ohne failed ist', () => {
        const start = new Date('2026-08-13T10:00:00.000Z')
        const match = matchWith({
            actualStartTime: start.toISOString(),
            teams: [team({timeString: '1:23.4'}), team({startNumber: 2, timeString: null})],
        })
        const clientNowMs = start.getTime() + 4000
        const state = streamClockState(match, clientNowMs, 0)
        expect(state).toEqual({phase: 'running', elapsedMs: 4000})
    })

    it('bleibt running, wenn keine Boote existieren', () => {
        const start = new Date('2026-08-13T10:00:00.000Z')
        const match = matchWith({actualStartTime: start.toISOString(), teams: []})
        const clientNowMs = start.getTime() + 1000
        expect(streamClockState(match, clientNowMs, 0)).toEqual({
            phase: 'running',
            elapsedMs: 1000,
        })
    })
})

describe('formatElapsed', () => {
    it("formatiert 83_450 ms als '1:23.4'", () => {
        expect(formatElapsed(83_450)).toBe('1:23.4')
    })

    it("formatiert ab einer Stunde als 'h:mm:ss.z'", () => {
        expect(formatElapsed(3_723_400)).toBe('1:02:03.4')
    })

    it('klemmt negative Werte auf 0', () => {
        expect(formatElapsed(-5000)).toBe('0:00.0')
    })
})

// Neu für die Stream-Bandgrafik CLOCK (Task 11): additive Erweiterung von `streamClockState`
// um einen optionalen vierten Parameter `sequenceStartedAt` — alle Aufrufe oben mit genau
// drei Argumenten bleiben dadurch unverändert (`sequenceStartedAt` ist `undefined`, exakt wie
// bisher `match.actualStartTime == null` ohne weitere Fallunterscheidung).
describe('streamClockState mit Sequenzstart (Countdown)', () => {
    it('zählt im Countdown ab Sequenzstart, mit Versatz-Korrektur (Sequenzstart vor now)', () => {
        const sequenceStart = new Date('2026-08-13T10:00:00.000Z')
        const match = matchWith({actualStartTime: null, teams: []})
        // Client-Uhr 2:41 (161 s) nach Sequenzstart plus 2 s Client-Server-Versatz.
        const clientNowMs = sequenceStart.getTime() + 161_000 + 2000
        const clockOffsetMs = 2000
        const state = streamClockState(match, clientNowMs, clockOffsetMs, sequenceStart.toISOString())
        expect(state).toEqual({phase: 'countdown', elapsedMs: 161_000})
    })

    it('klemmt auf 0, wenn der Sequenzstart laut Serverzeit noch in der Zukunft liegt (Sequenzstart nach now)', () => {
        const sequenceStart = new Date('2026-08-13T10:00:00.000Z')
        const match = matchWith({actualStartTime: null, teams: []})
        const clientNowMs = sequenceStart.getTime() - 5000
        const state = streamClockState(match, clientNowMs, 0, sequenceStart.toISOString())
        expect(state).toEqual({phase: 'countdown', elapsedMs: 0})
    })

    it('bleibt hidden ohne actualStartTime, wenn auch kein Sequenzstart vorliegt', () => {
        const match = matchWith({actualStartTime: null, teams: []})
        expect(streamClockState(match, Date.now(), 0, null)).toEqual({phase: 'hidden'})
    })

    it('wechselt bei gestempeltem Start auf running, auch wenn sequenceStartedAt noch mitgeschickt wird', () => {
        const sequenceStart = new Date('2026-08-13T10:00:00.000Z')
        const actualStart = new Date('2026-08-13T10:02:00.000Z')
        const match = matchWith({actualStartTime: actualStart.toISOString(), teams: [team({})]})
        const clientNowMs = actualStart.getTime() + 5000
        const state = streamClockState(match, clientNowMs, 0, sequenceStart.toISOString())
        expect(state).toEqual({phase: 'running', elapsedMs: 5000})
    })
})

describe('formatCountdown', () => {
    it("formatiert 161_000 ms als '−2:41' (echtes Minuszeichen U+2212)", () => {
        expect(formatCountdown(161_000)).toBe('−2:41')
    })

    it('zeigt 0 ohne Vorzeichen', () => {
        expect(formatCountdown(0)).toBe('0:00')
    })

    it('klemmt negative Werte auf 0 ohne Vorzeichen', () => {
        expect(formatCountdown(-4000)).toBe('0:00')
    })
})
