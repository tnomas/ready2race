import {describe, expect, it} from 'vitest'
import {EntryEvent, resolveEntry} from './appEntry'

const now = new Date('2026-08-15T10:00:00')

/** Eine Regatta im Betrieb (heute mittendrin) und eine vom Vorjahr. */
const running: EntryEvent = {
    id: 'e-2026',
    operationsStartsAt: '2026-08-14T07:00:00',
    lastEventDay: '2026-08-16',
}
const lastYear: EntryEvent = {
    id: 'e-2025',
    operationsStartsAt: '2025-08-15T07:00:00',
    lastEventDay: '2025-08-17',
}
const alsoRunning: EntryEvent = {
    id: 'e-cup',
    operationsStartsAt: '2026-08-15T06:00:00',
    lastEventDay: '2026-08-15',
}

describe('resolveEntry', () => {
    it('weist ohne Welt ab, bevor es um die Veranstaltung geht', () => {
        expect(resolveEntry({worlds: [], eventId: 'e-2026', events: [running], now})).toEqual({
            kind: 'FORBIDDEN',
        })
    })

    it('wartet, solange nichts gemerkt ist und die Liste noch lädt', () => {
        expect(resolveEntry({worlds: ['SCAN'], eventId: null, events: undefined, now})).toEqual({
            kind: 'WAIT',
        })
    })

    it('vertraut der gemerkten Veranstaltung, solange die Liste noch lädt (Offline-Start)', () => {
        expect(resolveEntry({worlds: ['SCAN'], eventId: 'e-2026', events: undefined, now})).toEqual(
            {kind: 'GO', to: '/app/scan'},
        )
    })

    it('übernimmt die einzige laufende Veranstaltung ohne Nachfrage', () => {
        expect(
            resolveEntry({worlds: ['SCAN'], eventId: null, events: [lastYear, running], now}),
        ).toEqual({kind: 'ADOPT_EVENT', eventId: 'e-2026'})
    })

    it('fragt, wenn keine oder mehrere Veranstaltungen laufen', () => {
        expect(resolveEntry({worlds: ['SCAN'], eventId: null, events: [lastYear], now})).toEqual({
            kind: 'CHOOSE_EVENT',
        })
        expect(
            resolveEntry({
                worlds: ['SCAN'],
                eventId: null,
                events: [running, alsoRunning],
                now,
            }),
        ).toEqual({kind: 'CHOOSE_EVENT'})
    })

    it('verwirft eine gemerkte Veranstaltung, die es nicht mehr gibt', () => {
        expect(resolveEntry({worlds: ['SCAN'], eventId: 'e-weg', events: [lastYear], now})).toEqual(
            {kind: 'CHOOSE_EVENT'},
        )
        expect(resolveEntry({worlds: ['SCAN'], eventId: 'e-weg', events: [running], now})).toEqual({
            kind: 'ADOPT_EVENT',
            eventId: 'e-2026',
        })
    })

    it('geht mit einer Welt direkt dorthin', () => {
        const events = [running]
        expect(resolveEntry({worlds: ['TIMING'], eventId: 'e-2026', events, now})).toEqual({
            kind: 'GO',
            to: '/app/timing',
        })
        expect(resolveEntry({worlds: ['DASHBOARD'], eventId: 'e-2026', events, now})).toEqual({
            kind: 'GO',
            to: '/app/dashboard',
        })
    })

    it('zeigt bei mehreren Welten die Kacheln', () => {
        expect(
            resolveEntry({worlds: ['SCAN', 'TIMING'], eventId: 'e-2026', events: [running], now}),
        ).toEqual({kind: 'GO', to: '/app/start'})
    })
})
