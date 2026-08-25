import {BoardConfig, BoardElementType, BoardViewDto} from '@api/types.gen'

/**
 * Reine Logik des Board-Kanals (`/api/ws/event/{eventId}/board/{boardId}`): URL-Bau,
 * Nachrichten-Parsen und die Frage, ob ein Board den Kanal überhaupt braucht.
 *
 * Bewusst ohne React und ohne DOM — dieselbe Aufteilung wie bei `eventChangePush.ts` und
 * `polling.ts`: was hier steht, träfe im Fehlerfall alle Anzeigen flächig, und genau das prüft
 * sich im Node-Umfeld ohne Browser. `useBoardViewSocket` ist nur noch Verdrahtung.
 *
 * Der Unterschied zum Veranstaltungs-Kanal ist der Zweck des ganzen Kanals: dort kommt ein
 * Fingerzeig („es hat sich etwas geändert"), auf den die Anzeige per HTTP nachlädt — hier kommt
 * der fertige Stand. Für das Livestream-Overlay ist genau dieser Nachschlag die spürbare
 * Verzögerung.
 */

/**
 * Welche Kacheln am Renngeschehen hängen — und damit, ob ein Board den Push-Kanal braucht.
 *
 * MATCH, MATCH_DETAIL und MATCH_LIST zeigen Läufe, Aufstellungen und Ergebnisse; STREAM ist das
 * Livestream-Overlay und der eigentliche Anlass dieses Kanals; DELAY zeigt den aktuellen
 * Verzug und springt mit jedem Start; AWARD_CEREMONY füllt sich, sobald eine Runde gewertet ist.
 *
 * CLOCK und TEXT hängen an nichts davon: die Uhr läuft ohnehin lokal gegen die Serverzeit
 * (`useServerClock`), und ein fester Text ändert sich nur, wenn jemand die Konfiguration
 * bearbeitet. Ein reines Uhr-/Text-Board bekommt deshalb gar keine offene Verbindung — es lebt
 * mit seinem Takt weiter, und der reicht dafür vollkommen.
 *
 * Weil der Kanal die GANZE Ansicht schickt, profitieren am Ende alle Kacheln eines Boards,
 * sobald auch nur eine davon Echtzeitbezug hat. Diese Liste entscheidet also nicht, was
 * aktualisiert wird, sondern nur, ob sich eine Verbindung lohnt.
 */
export const REALTIME_ELEMENT_TYPES: ReadonlySet<BoardElementType> = new Set<BoardElementType>([
    'MATCH',
    'MATCH_DETAIL',
    'MATCH_LIST',
    'STREAM',
    'DELAY',
    'AWARD_CEREMONY',
])

/** Hat das Board mindestens eine Kachel mit Echtzeitbezug (siehe [REALTIME_ELEMENT_TYPES])? */
export const boardNeedsRealtime = (config: BoardConfig | null | undefined): boolean =>
    config?.tiles?.some(tile => tile.elements.some(el => REALTIME_ELEMENT_TYPES.has(el.type))) ??
    false

/**
 * WebSocket-URL des Board-Kanals aus der API-Basis (`VITE_API_BASE_URL`, absolut oder relativ
 * wie `/api`) und der Seiten-URL — dieselbe Auflösung wie bei Timing- und
 * Veranstaltungs-Kanal: gegen die Seite auflösen, http(s) gegen ws(s) tauschen, Pfad anhängen.
 */
export const buildBoardViewWsUrl = (
    apiBaseUrl: string,
    pageHref: string,
    eventId: string,
    boardId: string,
): string => {
    const abs = new URL(apiBaseUrl, pageHref)
    abs.protocol = abs.protocol === 'https:' ? 'wss:' : 'ws:'
    const path = abs.pathname.replace(/\/$/, '')
    return `${abs.origin}${path}/ws/event/${eventId}/board/${boardId}`
}

/**
 * Parst eine Kanal-Nachricht (`{"type":"boardView","view":{…}}`) und liefert die Ansicht —
 * `null` für alles Unlesbare oder Unbekannte, damit ein künftiger Nachrichtentyp alte Anzeigen
 * nicht stört (dieselbe Nachsicht wie `parseEventChangeMessage`).
 *
 * Geprüft wird nur der Umschlag, nicht der Inhalt: die Nutzlast ist Feld für Feld dieselbe, die
 * der HTTP-Endpunkt liefert (derselbe Jackson-Mapper, siehe `BoardViewBroadcaster`), und eine
 * zweite, hier nachgebaute Feldprüfung würde bei jeder DTO-Erweiterung auseinanderlaufen.
 * `boardId` wird trotzdem verlangt: daran erkennt die Anzeige, dass sie den Stand IHRES Boards
 * hält und nicht einen versehentlich fremden.
 */
export const parseBoardViewMessage = (raw: string): BoardViewDto | null => {
    let data: unknown
    try {
        data = JSON.parse(raw)
    } catch {
        return null
    }
    if (typeof data !== 'object' || data === null) return null
    const message = data as {type?: unknown; view?: unknown}
    if (message.type !== 'boardView') return null
    const view = message.view
    if (typeof view !== 'object' || view === null) return null
    if (typeof (view as {boardId?: unknown}).boardId !== 'string') return null
    return view as BoardViewDto
}
