/**
 * Reine Logik des Veranstaltungs-Kanals (`/api/ws/event/{eventId}/info`): URL-Bau,
 * Nachrichten-Parsen, Entprellung und die Fallback-Entscheidung fürs Polling.
 *
 * Bewusst ohne React und ohne DOM — das Frontend prüft mit Vitest im Node-Umfeld, und was hier
 * steht, ist genau der Teil, an dem ein Fehler die Anzeigen flächig träfe (siehe `polling.ts`
 * für dieselbe Aufteilung). `useEventChangeSocket` ist nur noch Verdrahtung.
 */

/**
 * Entprell-Fenster für Refetches nach einem Push: Massen-Ereignisse (eine Welle wertet acht
 * Boote) bumpen im Sekundenbruchteil mehrfach — gesammelt wird 800 ms, geladen einmal.
 */
export const EVENT_CHANGE_DEBOUNCE_MS = 800

/**
 * Streckfaktor fürs Polling, solange der Push-Kanal steht: aus dem Arbeitstakt wird ein träger
 * Sicherheitstakt (15 s → 2 min), der nur noch stumm gestorbene Verbindungen abfängt (Proxy hält
 * die Leitung, Server-Fanout hat den Abonnenten verloren). Ganz aussetzen wäre billiger, aber
 * genau diese Fälle blieben dann unsichtbar.
 */
export const EVENT_CHANGE_POLL_STRETCH = 8

/**
 * Der wirksame Poll-Takt: gestreckt, solange der Push-Kanal verbunden ist — getrennt gilt
 * unverändert der heutige Takt, kein Board wird ohne Socket schlechter.
 */
export const stretchedPollMs = (baseMs: number, pushConnected: boolean): number =>
    pushConnected ? baseMs * EVENT_CHANGE_POLL_STRETCH : baseMs

/**
 * WebSocket-URL des Veranstaltungs-Kanals aus der API-Basis (`VITE_API_BASE_URL`, absolut oder
 * relativ wie `/api`) und der Seiten-URL — dieselbe Auflösung wie beim Timing-Kanal:
 * gegen die Seite auflösen, http(s) gegen ws(s) tauschen, Pfad anhängen.
 */
export const buildEventChangeWsUrl = (
    apiBaseUrl: string,
    pageHref: string,
    eventId: string,
): string => {
    const abs = new URL(apiBaseUrl, pageHref)
    abs.protocol = abs.protocol === 'https:' ? 'wss:' : 'ws:'
    const path = abs.pathname.replace(/\/$/, '')
    return `${abs.origin}${path}/ws/event/${eventId}/info`
}

/**
 * Parst eine Kanal-Nachricht (`{"type":"changed","marker":n}`) und liefert den Markerstand —
 * `null` für alles Unlesbare oder Unbekannte, damit ein künftiger Nachrichtentyp alte Clients
 * nicht stört.
 */
export const parseEventChangeMessage = (raw: string): number | null => {
    let data: unknown
    try {
        data = JSON.parse(raw)
    } catch {
        return null
    }
    if (typeof data !== 'object' || data === null) return null
    const message = data as {type?: unknown; marker?: unknown}
    if (message.type !== 'changed' || typeof message.marker !== 'number') return null
    return message.marker
}

export type ChangeDebouncer = {
    /** Meldet einen Push; [fire] läuft erst, wenn [delayMs] lang kein weiterer kam. */
    bump: () => void
    /** True, solange ein gesammelter, noch nicht gefeuerter Push aussteht. */
    pending: () => boolean
    /** Verwirft einen ausstehenden Push (Abbau, Veranstaltungswechsel). */
    cancel: () => void
}

/**
 * Nachlaufende Entprellung: jeder `bump` schiebt den Zünder neu auf [delayMs] hinaus — ein
 * Massen-Ergebniseingang lädt so genau einmal, nach der letzten Nachricht des Schubs.
 */
export const createChangeDebouncer = (
    fire: () => void,
    delayMs: number = EVENT_CHANGE_DEBOUNCE_MS,
): ChangeDebouncer => {
    let timer: ReturnType<typeof setTimeout> | null = null

    return {
        bump: () => {
            if (timer !== null) clearTimeout(timer)
            timer = setTimeout(() => {
                timer = null
                fire()
            }, delayMs)
        },
        pending: () => timer !== null,
        cancel: () => {
            if (timer !== null) {
                clearTimeout(timer)
                timer = null
            }
        },
    }
}

/**
 * Ob ein (Wieder-)Verbinden ein sofortiges Neuladen auslösen soll: nur, wenn vorher schon eine
 * Verbindung stand oder ein Versuch scheiterte — beim allerersten glatten Verbinden direkt nach
 * dem Einhängen hat der Poller gerade selbst geladen, ein zweiter Abruf wäre reine Doppelarbeit.
 */
export const shouldRefetchOnConnect = (hadConnection: boolean, hadFailure: boolean): boolean =>
    hadConnection || hadFailure
