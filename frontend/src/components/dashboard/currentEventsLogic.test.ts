import {describe, expect, it} from 'vitest'
import {currentEventStatus, formatEventDateRange, sortCurrentEvents} from './currentEventsLogic.ts'

// `operationsStartsAt` ist eine Wanduhrzeit des Servers (Europe/Berlin); die Tests rechnen mit
// Zeiten weit genug weg von jeder Fenstergrenze, damit die Zone des Testrechners keine Rolle spielt.
const event = (
    name: string,
    firstEventDay?: string,
    lastEventDay?: string,
    operationsStartsAt?: string,
) => ({
    name,
    firstEventDay,
    lastEventDay,
    operationsStartsAt:
        operationsStartsAt ?? (firstEventDay ? `${firstEventDay}T07:00:00` : undefined),
})

const now = new Date(2026, 7, 15, 12, 0) // 15.08.2026, mittags

describe('currentEventStatus', () => {
    it('erkennt laufend, kommend, vergangen und ohne Tage', () => {
        expect(currentEventStatus(event('A', '2026-08-14', '2026-08-16'), now)).toBe('running')
        expect(currentEventStatus(event('B', '2026-09-01', '2026-09-02'), now)).toBe('upcoming')
        expect(currentEventStatus(event('C', '2026-08-01', '2026-08-02'), now)).toBe('past')
        expect(currentEventStatus(event('D'), now)).toBe('undated')
    })

    it('zählt den letzten Tag bis Mitternacht als laufend', () => {
        const lateEvening = new Date(2026, 7, 16, 23, 30)
        expect(currentEventStatus(event('A', '2026-08-14', '2026-08-16'), lateEvening)).toBe(
            'running',
        )
        const nextMorning = new Date(2026, 7, 17, 0, 30)
        expect(currentEventStatus(event('A', '2026-08-14', '2026-08-16'), nextMorning)).toBe('past')
    })

    it('ist vor Betriebsbeginn noch kommend', () => {
        expect(
            currentEventStatus(event('E', '2026-08-15', '2026-08-15', '2026-08-15T18:00:00'), now),
        ).toBe('upcoming')
    })
})

describe('sortCurrentEvents', () => {
    it('laufende zuerst, dann kommende aufsteigend, dann vergangene absteigend, ohne Tage zuletzt', () => {
        const sorted = sortCurrentEvents(
            [
                event('ohne Tage B'),
                event('alt', '2025-08-14', '2025-08-16'),
                event('übernächste', '2026-10-01', '2026-10-02'),
                event('ohne Tage A'),
                event('läuft', '2026-08-14', '2026-08-16'),
                event('jüngst vergangen', '2026-08-01', '2026-08-02'),
                event('nächste', '2026-09-01', '2026-09-01'),
            ],
            now,
        )
        expect(sorted.map(e => e.event.name)).toEqual([
            'läuft',
            'nächste',
            'übernächste',
            'jüngst vergangen',
            'alt',
            'ohne Tage A',
            'ohne Tage B',
        ])
        expect(sorted.map(e => e.status)).toEqual([
            'running',
            'upcoming',
            'upcoming',
            'past',
            'past',
            'undated',
            'undated',
        ])
    })
})

describe('formatEventDateRange', () => {
    it('zeigt einen Tag, eine Spanne im selben Jahr und über den Jahreswechsel', () => {
        expect(formatEventDateRange('2026-08-14', '2026-08-14', 'de-DE')).toBe('14.08.2026')
        expect(formatEventDateRange('2026-08-14', '2026-08-16', 'de-DE')).toBe(
            '14.08. – 16.08.2026',
        )
        expect(formatEventDateRange('2026-12-31', '2027-01-01', 'de-DE')).toBe(
            '31.12.2026 – 01.01.2027',
        )
    })

    it('liefert null ohne Tage', () => {
        expect(formatEventDateRange(undefined, undefined, 'de-DE')).toBeNull()
    })
})
