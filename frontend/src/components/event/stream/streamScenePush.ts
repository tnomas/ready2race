import {StreamSceneViewDto} from '@api/types.gen'

/**
 * Reine Logik des Szenen-Kanals (`/api/ws/event/{eventId}/stream/{sceneId}`): URL-Bau und
 * Nachrichten-Parsen. Bewusst ohne React und ohne DOM — dasselbe Muster wie `boardViewPush.ts`,
 * dessen Beschreibung ausführlich begründet, warum genau dieser Teil der Bühne im Node-Umfeld
 * geprüft wird und nicht erst im Browser: ein Fehler hier träfe JEDE Bühne, die diesen Kanal
 * verwendet. `useStreamSceneSocket` ist nur noch Verdrahtung.
 */

/**
 * WebSocket-URL des Szenen-Kanals aus der API-Basis (`VITE_API_BASE_URL`) und der Seiten-URL —
 * dieselbe Auflösung wie bei Board- und Zeitnahme-Kanal.
 */
export const buildStreamSceneWsUrl = (
    apiBaseUrl: string,
    pageHref: string,
    eventId: string,
    sceneId: string,
): string => {
    const abs = new URL(apiBaseUrl, pageHref)
    abs.protocol = abs.protocol === 'https:' ? 'wss:' : 'ws:'
    const path = abs.pathname.replace(/\/$/, '')
    return `${abs.origin}${path}/ws/event/${eventId}/stream/${sceneId}`
}

/**
 * Parst eine Kanal-Nachricht (`{"type":"streamSceneView","view":{…}}`) und liefert die
 * Ansicht — `null` für alles Unlesbare oder Unbekannte, damit ein künftiger Nachrichtentyp die
 * Bühne nicht mitreißt (dieselbe Nachsicht wie `parseBoardViewMessage`).
 *
 * Geprüft wird nur der Umschlag, nicht der Inhalt: die Nutzlast ist Feld für Feld dieselbe, die
 * `getStreamSceneView` liefert. `sceneId` wird trotzdem verlangt: daran erkennt die Bühne, dass
 * sie den Stand IHRER Szene hält.
 */
export const parseStreamSceneMessage = (raw: string): StreamSceneViewDto | null => {
    let data: unknown
    try {
        data = JSON.parse(raw)
    } catch {
        return null
    }
    if (typeof data !== 'object' || data === null) return null
    const message = data as {type?: unknown; view?: unknown}
    if (message.type !== 'streamSceneView') return null
    const view = message.view
    if (typeof view !== 'object' || view === null) return null
    if (typeof (view as {sceneId?: unknown}).sceneId !== 'string') return null
    return view as StreamSceneViewDto
}
