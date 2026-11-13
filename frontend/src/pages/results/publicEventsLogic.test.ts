import {describe, expect, it} from 'vitest'
import {format} from 'date-fns'
import {
    eventPhase,
    formatEventDateRange,
    groupEventsByPhase,
    todayIso,
} from './publicEventsLogic.ts'

type E = {name: string; from?: string; to?: string}
const today = '2026-11-13'

describe('eventPhase', () => {
    it('erkennt laufend, demnächst, vergangen', () => {
        expect(eventPhase({from: '2026-11-13', to: '2026-11-13'}, today)).toBe('running')
        expect(eventPhase({from: '2026-11-12', to: '2026-11-14'}, today)).toBe('running')
        expect(eventPhase({from: '2026-11-14', to: '2026-11-15'}, today)).toBe('upcoming')
        expect(eventPhase({from: '2026-11-10', to: '2026-11-12'}, today)).toBe('past')
    })

    it('nimmt bei fehlendem Ende den Beginn als einzigen Tag und umgekehrt', () => {
        expect(eventPhase({from: '2026-11-13'}, today)).toBe('running')
        expect(eventPhase({to: '2026-11-12'}, today)).toBe('past')
        expect(eventPhase({from: null, to: null}, today)).toBe('undated')
        expect(eventPhase({}, today)).toBe('undated')
    })
})

describe('groupEventsByPhase', () => {
    it('sortiert laufend/demnächst aufsteigend, vergangen absteigend, Gleichstand nach Name', () => {
        const events: E[] = [
            {name: 'Alt', from: '2026-08-14', to: '2026-08-16'},
            {name: 'Älter', from: '2026-08-01', to: '2026-08-02'},
            {name: 'Später', from: '2026-12-01', to: '2026-12-01'},
            {name: 'Bald', from: '2026-11-20', to: '2026-11-21'},
            {name: 'Heute B', from: '2026-11-13', to: '2026-11-13'},
            {name: 'Heute A', from: '2026-11-13', to: '2026-11-13'},
            {name: 'Ohne'},
        ]
        const groups = groupEventsByPhase(
            events,
            e => ({from: e.from, to: e.to}),
            e => e.name,
            today,
        )
        expect(groups.running.map(e => e.name)).toEqual(['Heute A', 'Heute B'])
        expect(groups.upcoming.map(e => e.name)).toEqual(['Bald', 'Später'])
        expect(groups.past.map(e => e.name)).toEqual(['Alt', 'Älter'])
        expect(groups.undated.map(e => e.name)).toEqual(['Ohne'])
    })

    it('lässt die Eingabe unverändert', () => {
        const events: E[] = [
            {name: 'B', from: '2026-12-02'},
            {name: 'A', from: '2026-12-01'},
        ]
        groupEventsByPhase(
            events,
            e => e,
            e => e.name,
            today,
        )
        expect(events.map(e => e.name)).toEqual(['B', 'A'])
    })
})

describe('formatEventDateRange', () => {
    const fmt = (d: Date) => format(d, 'dd.MM.yyyy')

    it('zeigt einen Tag einmal und mehrere als Spanne', () => {
        expect(formatEventDateRange({from: '2026-11-13', to: '2026-11-13'}, fmt)).toBe('13.11.2026')
        expect(formatEventDateRange({from: '2026-08-14', to: '2026-08-16'}, fmt)).toBe(
            '14.08.2026 – 16.08.2026',
        )
    })

    it('kommt mit fehlenden oder kaputten Werten aus', () => {
        expect(formatEventDateRange({from: '2026-08-14'}, fmt)).toBe('14.08.2026')
        expect(formatEventDateRange({to: '2026-08-16'}, fmt)).toBe('16.08.2026')
        expect(formatEventDateRange({}, fmt)).toBeNull()
        expect(formatEventDateRange({from: 'kaputt'}, fmt)).toBeNull()
    })
})

describe('todayIso', () => {
    it('liefert den Kalendertag in Ortszeit', () => {
        expect(todayIso(new Date(2026, 10, 13, 23, 59))).toBe('2026-11-13')
    })
})
