/**
 * Ablage der Board-Geräte-Tokens auf Anzeigegeräten.
 *
 * „Link teilen" in der Board-Verwaltung erzeugt einen Link auf die Anzeige-Route mit dem
 * Geräte-Token als Query-Parameter (`/board/{eventId}/{boardId}?token=…`). Beim ersten Aufruf
 * übernimmt die Route das Token hierher und entfernt es aus der Adresszeile (replace-Redirect),
 * damit es nicht in Verlauf und Screenshots hängen bleibt. Ab dann authentifizieren sich die
 * Board-Aufrufe des Geräts über den `X-Timing-Device-Token`-Header — es ist dieselbe Token-Tabelle
 * wie bei der Zeitnahme, nur mit einem Board statt eines Postens als Ziel.
 *
 * ABWEICHUNG vom Zeitnahme-Vorbild (`utils/timing/deviceSession.ts`), das bewusst nur EIN Token je
 * Gerät führt: Hier liegt je Board ein eigenes Token, in einem Verzeichnis mit dem Schlüssel
 * `eventId/boardId`. Grund ist der Unterschied im Betrieb — ein geteiltes Zeitnahme-Handy gehört zu
 * genau einem Posten, ein Anzeigegerät dagegen zeigt der Reihe nach mehrere Boards (der Laptop am
 * Steg schaltet zwischen Steg-Anzeige und Livestream-Overlay, der Rechner in der Regieecke hat
 * beide in zwei Fenstern offen). Mit einem Einzelplatz überschriebe jeder neue Board-Link den
 * vorigen, und das zuerst geöffnete Fenster liefe beim nächsten Takt in einen 401 — das Board-Token
 * gilt serverseitig für GENAU EIN Board, ein fremdes wird wie ein widerrufenes abgelehnt.
 *
 * Der Speicher wird injiziert, weil die vitest-Umgebung `node` ist und dort kein `localStorage`
 * existiert (gleiches Muster wie `sessionToken.ts` und `deviceSession.ts`).
 */

import {WebStorageLike} from '@contexts/user/sessionToken.ts'

const KEY = 'board.deviceTokens'

/** Verzeichnis `eventId/boardId` → Token. */
export type BoardDeviceTokens = Record<string, string>

const entryKey = (eventId: string, boardId: string): string => `${eventId}/${boardId}`

const browserStorage = (): WebStorageLike => localStorage

export const readBoardDeviceTokens = (
    storage: WebStorageLike = browserStorage(),
): BoardDeviceTokens => {
    const raw = storage.getItem(KEY)
    if (raw === null) return {}
    try {
        const parsed: unknown = JSON.parse(raw)
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
            // Nur die brauchbaren Einträge übernehmen: ein einzelner kaputter Wert (etwa aus einer
            // früheren Fassung des Formats) darf nicht das ganze Verzeichnis wertlos machen — auf
            // einem montierten Bildschirm hieße das, dass alle Boards gleichzeitig ausfallen.
            const result: BoardDeviceTokens = {}
            for (const [key, value] of Object.entries(parsed)) {
                if (typeof value === 'string' && value !== '') result[key] = value
            }
            return result
        }
    } catch {
        // fällt unten auf Aufräumen durch
    }
    storage.removeItem(KEY)
    return {}
}

export const writeBoardDeviceToken = (
    eventId: string,
    boardId: string,
    token: string,
    storage: WebStorageLike = browserStorage(),
): void => {
    const tokens = readBoardDeviceTokens(storage)
    tokens[entryKey(eventId, boardId)] = token
    storage.setItem(KEY, JSON.stringify(tokens))
}

/**
 * Das Token GENAU dieses Boards — der Weg für die Board-Ansicht
 * (`/event/{eventId}/info/board/{boardId}`). Der Server verlangt dort die Board-Bindung: ein Token
 * eines anderen Boards, ein Posten-Token und ein widerrufenes Token werden alle gleich mit 401
 * beantwortet.
 */
export const boardDeviceToken = (
    eventId: string,
    boardId: string,
    storage: WebStorageLike = browserStorage(),
): string | null => readBoardDeviceTokens(storage)[entryKey(eventId, boardId)] ?? null

/**
 * IRGENDEIN Board-Token dieser Veranstaltung — für die Kurzliste
 * (`/event/{eventId}/info/boards`), die der Server absichtlich lockerer prüft: Ein geteilter
 * Bildschirm muss sein Board erst finden können, bevor er dessen Id kennt (die Bestands-Adresse
 * `/board/{eventId}` leitet über genau diese Liste weiter). Die Inhalte bleiben hinter der
 * Board-Bindung des Einzelendpunkts.
 */
export const boardDeviceTokenForEvent = (
    eventId: string,
    storage: WebStorageLike = browserStorage(),
): string | null => {
    const prefix = `${eventId}/`
    for (const [key, token] of Object.entries(readBoardDeviceTokens(storage))) {
        if (key.startsWith(prefix)) return token
    }
    return null
}

/**
 * Einzelnes Board vergessen. Gedacht für den Fall, dass ein Token nicht mehr trägt (widerrufen,
 * neu ausgestellt) — die übrigen Boards desselben Geräts sollen davon unberührt bleiben.
 */
export const clearBoardDeviceToken = (
    eventId: string,
    boardId: string,
    storage: WebStorageLike = browserStorage(),
): void => {
    const tokens = readBoardDeviceTokens(storage)
    if (!(entryKey(eventId, boardId) in tokens)) return
    delete tokens[entryKey(eventId, boardId)]
    storage.setItem(KEY, JSON.stringify(tokens))
}

/** Das ganze Verzeichnis vergessen (Gerät wird weitergegeben). */
export const clearBoardDeviceTokens = (storage: WebStorageLike = browserStorage()): void => {
    storage.removeItem(KEY)
}
