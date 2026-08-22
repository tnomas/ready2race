/**
 * Ablage des Zeitnahme-Geräte-Tokens auf geteilten Geräten.
 *
 * „Auf Gerät teilen" erzeugt einen Link auf die /event-Timing-Route mit dem Geräte-Token als
 * Query-Parameter (`?token=…`). Beim ersten Aufruf übernimmt die Route das Token hierher und
 * entfernt es aus der Adresszeile (replace-Redirect), damit es nicht in Verlauf oder Screenshots
 * hängen bleibt. Ab dann authentifizieren sich alle Timing-Aufrufe des Geräts über den
 * `X-Timing-Device-Token`-Header bzw. den Token-Slot des WebSocket-Subprotokolls — dieselben
 * Tokens, die der Leitstand-Geräte-Reiter ausstellt und widerruft.
 *
 * Bewusst nur EIN Token je Gerät (kein Verzeichnis je Posten): ein geteiltes Handy gehört zu
 * genau einem Posten; wer es an einen anderen Posten weitergibt, scannt dessen QR-Code und
 * überschreibt damit die Ablage.
 *
 * Der Speicher wird injiziert, weil die vitest-Umgebung `node` ist und dort kein `localStorage`
 * existiert (gleiches Muster wie `sessionToken.ts`).
 */

import {WebStorageLike} from '@contexts/user/sessionToken.ts'

/** Muss `TIMING_DEVICE_TOKEN_HEADER` im Backend entsprechen (timing.kt). */
export const TIMING_DEVICE_TOKEN_HEADER = 'X-Timing-Device-Token'

const KEY = 'timing.deviceSession'

export type TimingDeviceSession = {
    token: string
    event: string
    station: string
}

const browserStorage = (): WebStorageLike => localStorage

export const readDeviceSession = (
    storage: WebStorageLike = browserStorage(),
): TimingDeviceSession | null => {
    const raw = storage.getItem(KEY)
    if (raw === null) return null
    try {
        const parsed = JSON.parse(raw) as TimingDeviceSession
        if (
            typeof parsed?.token === 'string' &&
            typeof parsed?.event === 'string' &&
            typeof parsed?.station === 'string'
        ) {
            return parsed
        }
    } catch {
        // fällt unten auf Aufräumen durch
    }
    storage.removeItem(KEY)
    return null
}

export const writeDeviceSession = (
    session: TimingDeviceSession,
    storage: WebStorageLike = browserStorage(),
): void => {
    storage.setItem(KEY, JSON.stringify(session))
}

export const clearDeviceSession = (storage: WebStorageLike = browserStorage()): void => {
    storage.removeItem(KEY)
}

/**
 * Das abgelegte Token, sofern es zu dieser Veranstaltung gehört. Lesend reicht die
 * Veranstaltungs-Bindung — der Server prüft genau das (`validateForEvent`).
 */
export const deviceSessionForEvent = (
    eventId: string,
    storage: WebStorageLike = browserStorage(),
): TimingDeviceSession | null => {
    const session = readDeviceSession(storage)
    return session !== null && session.event === eventId ? session : null
}

/**
 * Das abgelegte Token, sofern es genau zu diesem Posten gehört. Das Erfassungsboard verlangt die
 * Posten-Bindung, weil der Zeitmarken-POST serverseitig ohnehin nur für den Posten des Tokens
 * durchgeht — ein Board am falschen Posten wäre eine Erfassung, die still scheitert.
 */
export const deviceSessionForStation = (
    eventId: string,
    stationId: string,
    storage: WebStorageLike = browserStorage(),
): TimingDeviceSession | null => {
    const session = deviceSessionForEvent(eventId, storage)
    return session !== null && session.station === stationId ? session : null
}
