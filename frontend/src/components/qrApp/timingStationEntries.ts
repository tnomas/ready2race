/**
 * Die Posten-Einträge der Helfer-App: welche Posten erfassen, welche nur anzeigen, und an welchem
 * Posten dieses Gerät zuletzt stand.
 *
 * Der zuletzt genutzte Posten wird nur markiert, nicht automatisch geöffnet: Ein Gerät wandert am
 * Renntag zwischen Posten, und ein stilles Weiterleiten an den Zielposten von gestern wäre genau
 * die Verwechslung, die das Gedächtnis der App sonst vermeidet (siehe `appMemory.ts`).
 *
 * Der Speicher wird injiziert, weil die vitest-Umgebung `node` ist.
 */
import {TimingStationType} from '@api/types.gen.ts'
import {WebStorageLike} from '@contexts/user/sessionToken.ts'

export const LAST_STATION_KEY = 'app.lastTimingStation'

type StationLike = {type: TimingStationType; sorting: number}

/** Erfassungsposten (Start, Zwischenzeit, Ziel) und Anzeigen getrennt, je nach `sorting`. */
export const splitStationEntries = <T extends StationLike>(
    stations: readonly T[],
): {capture: T[]; displays: T[]} => {
    const sorted = [...stations].sort((a, b) => a.sorting - b.sorting)
    return {
        capture: sorted.filter(station => station.type !== 'ANZEIGE'),
        displays: sorted.filter(station => station.type === 'ANZEIGE'),
    }
}

type StoredLastStation = {eventId: string; stationId: string}

export const readLastStation = (eventId: string, store: WebStorageLike): string | null => {
    const raw = store.getItem(LAST_STATION_KEY)
    if (raw === null) return null
    let parsed: Partial<StoredLastStation>
    try {
        parsed = JSON.parse(raw) as Partial<StoredLastStation>
    } catch {
        return null
    }
    if (parsed.eventId !== eventId || typeof parsed.stationId !== 'string') return null
    return parsed.stationId
}

export const writeLastStation = (
    eventId: string,
    stationId: string,
    store: WebStorageLike,
): void => {
    const stored: StoredLastStation = {eventId, stationId}
    store.setItem(LAST_STATION_KEY, JSON.stringify(stored))
}
