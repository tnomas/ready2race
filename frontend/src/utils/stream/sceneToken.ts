/**
 * Ablage der Szenen-Geräte-Tokens auf Bühnen-Geräten.
 *
 * „Link teilen" in der Szenen-Verwaltung erzeugt einen Link auf die Bühnen-Route mit dem
 * Geräte-Token im Fragment (`/event/{eventId}/stream/{sceneId}#token=…`; ältere Links `?token=…`). Beim ersten
 * Aufruf übernimmt die Route das Token hierher und entfernt es aus der Adresszeile
 * (replace-Redirect), damit es nicht in Verlauf und Screenshots hängen bleibt. Ab dann
 * authentifizieren sich die Szenen-Aufrufe des Geräts über den `X-Timing-Device-Token`-Header —
 * dieselbe Token-Tabelle wie bei Zeitnahme und Boards, nur mit einer Szene statt eines Postens
 * oder Boards als Ziel.
 *
 * Wie bei Boards (`utils/board/deviceToken.ts`) liegt je Szene ein eigenes Token, in einem
 * Verzeichnis mit dem Schlüssel `eventId/sceneId`: ein Regie-Rechner kann mehrere Bühnen
 * (Szenen) gleichzeitig in getrennten Fenstern offen haben, und jede zeigt ihre eigene.
 *
 * Der Speicher wird injiziert, weil die vitest-Umgebung `node` ist und dort kein `localStorage`
 * existiert (gleiches Muster wie `sessionToken.ts` und `board/deviceToken.ts`).
 */

import {WebStorageLike} from '@contexts/user/sessionToken.ts'

const KEY = 'stream.sceneDeviceTokens'

/** Verzeichnis `eventId/sceneId` → Token. */
export type StreamSceneDeviceTokens = Record<string, string>

const entryKey = (eventId: string, sceneId: string): string => `${eventId}/${sceneId}`

const browserStorage = (): WebStorageLike => localStorage

export const readStreamSceneDeviceTokens = (
    storage: WebStorageLike = browserStorage(),
): StreamSceneDeviceTokens => {
    const raw = storage.getItem(KEY)
    if (raw === null) return {}
    try {
        const parsed: unknown = JSON.parse(raw)
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
            // Nur die brauchbaren Einträge übernehmen: ein einzelner kaputter Wert darf nicht
            // das ganze Verzeichnis wertlos machen — sonst fielen alle offenen Bühnen auf einmal
            // aus.
            const result: StreamSceneDeviceTokens = {}
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

export const writeStreamSceneDeviceToken = (
    eventId: string,
    sceneId: string,
    token: string,
    storage: WebStorageLike = browserStorage(),
): void => {
    const tokens = readStreamSceneDeviceTokens(storage)
    tokens[entryKey(eventId, sceneId)] = token
    storage.setItem(KEY, JSON.stringify(tokens))
}

/** Das Token GENAU dieser Szene — der Weg für die Bühne (`/event/{eventId}/stream/{sceneId}`). */
export const streamSceneDeviceToken = (
    eventId: string,
    sceneId: string,
    storage: WebStorageLike = browserStorage(),
): string | null => readStreamSceneDeviceTokens(storage)[entryKey(eventId, sceneId)] ?? null

/**
 * Einzelne Szene vergessen. Gedacht für den Fall, dass ein Token nicht mehr trägt (widerrufen,
 * neu ausgestellt) — die übrigen Szenen desselben Geräts bleiben davon unberührt.
 */
export const clearStreamSceneDeviceToken = (
    eventId: string,
    sceneId: string,
    storage: WebStorageLike = browserStorage(),
): void => {
    const tokens = readStreamSceneDeviceTokens(storage)
    if (!(entryKey(eventId, sceneId) in tokens)) return
    delete tokens[entryKey(eventId, sceneId)]
    storage.setItem(KEY, JSON.stringify(tokens))
}
