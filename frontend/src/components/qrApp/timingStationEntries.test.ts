import {describe, expect, it} from 'vitest'
import {WebStorageLike} from '@contexts/user/sessionToken.ts'
import {
    LAST_STATION_KEY,
    readLastStation,
    splitStationEntries,
    writeLastStation,
} from './timingStationEntries'

const memoryStore = (): WebStorageLike & {data: Map<string, string>} => {
    const data = new Map<string, string>()
    return {
        data,
        getItem: key => data.get(key) ?? null,
        setItem: (key, value) => {
            data.set(key, value)
        },
        removeItem: key => {
            data.delete(key)
        },
    }
}

const station = (id: string, type: 'START' | 'SPLIT' | 'FINISH' | 'ANZEIGE', sorting: number) => ({
    id,
    name: id,
    type,
    sorting,
})

describe('splitStationEntries', () => {
    it('trennt Erfassungsposten von Anzeigen und ordnet nach Reihenfolge', () => {
        const {capture, displays} = splitStationEntries([
            station('ziel', 'FINISH', 3),
            station('anzeige', 'ANZEIGE', 4),
            station('start', 'START', 1),
            station('boje', 'SPLIT', 2),
        ])
        expect(capture.map(s => s.id)).toEqual(['start', 'boje', 'ziel'])
        expect(displays.map(s => s.id)).toEqual(['anzeige'])
    })

    it('liefert leere Listen ohne Posten', () => {
        expect(splitStationEntries([])).toEqual({capture: [], displays: []})
    })

    it('verändert die übergebene Liste nicht', () => {
        const input = [station('b', 'FINISH', 2), station('a', 'START', 1)]
        splitStationEntries(input)
        expect(input.map(s => s.id)).toEqual(['b', 'a'])
    })
})

describe('zuletzt genutzter Posten', () => {
    it('ist ohne Eintrag nicht gemerkt', () => {
        expect(readLastStation('event-1', memoryStore())).toBeNull()
    })

    it('gilt nur für dieselbe Veranstaltung', () => {
        const store = memoryStore()
        writeLastStation('event-1', 'ziel', store)
        expect(readLastStation('event-1', store)).toBe('ziel')
        expect(readLastStation('event-2', store)).toBeNull()
    })

    it('übersteht kaputte Einträge', () => {
        const store = memoryStore()
        store.setItem(LAST_STATION_KEY, '{kein json')
        expect(readLastStation('event-1', store)).toBeNull()
        store.setItem(LAST_STATION_KEY, JSON.stringify({eventId: 'event-1'}))
        expect(readLastStation('event-1', store)).toBeNull()
    })
})
