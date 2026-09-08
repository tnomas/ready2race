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
/**
 * Ob eine eingehende Nachricht überhaupt ein erkannter Rahmen ist (irgendein JSON-Objekt mit
 * einem `type`-Feld) — für die Lebendigkeits-Erkennung zählt JEDER erkannte Rahmen, nicht nur
 * ein Zustandsrahmen: der Herzschlag (`{"type":"heartbeat"}`, siehe `StreamSceneBroadcaster`)
 * trägt bewusst keinen Stand, soll aber genauso den "zuletzt gehört"-Zeitpunkt der Bühne UND des
 * Kontroll-Panels auffrischen wie ein echter `streamSceneView`-Push — sonst hielte eine ruhige,
 * aber gesunde Szene die Veraltet-Erkennung für gestört, nur weil sich am Renngeschehen gerade
 * nichts ändert.
 */
export const isRecognizedStreamSceneFrame = (raw: string): boolean => {
    let data: unknown
    try {
        data = JSON.parse(raw)
    } catch {
        return false
    }
    if (typeof data !== 'object' || data === null) return false
    return typeof (data as {type?: unknown}).type === 'string'
}

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

/**
 * Verarbeitet einen rohen Kanal-Rahmen vollständig: Lebendigkeit ZUERST und für jeden erkannten
 * Rahmen (Herzschlag wie Zustand gleichermaßen — Begründung bei `isRecognizedStreamSceneFrame`),
 * danach — falls der Rahmen einen Zustand trägt — die Anwendung über [onView].
 *
 * Bewusst OHNE jede Sichtbarkeits-Bedingung: Eine frühere Fassung stellte eine eingetroffene
 * Ansicht zurück, solange `document.hidden` galt, und wendete sie erst beim Zurückkehren an
 * (Vorbild `useBoardViewSocket`, dort für eine Kontroll-Oberfläche im Hintergrund-Tab gedacht).
 * Für eine Aufnahmequelle ist das fatal: Wirecast/CEF-Browserquellen melden ihr Dokument oft
 * dauerhaft als `hidden`, obwohl sie aktiv aufnehmen — die Bühne fror damit auf dem ERSTEN
 * Stand ein, während der Herzschlag die Veraltet-Erkennung weiter für gesund hielt (kein
 * `stale`, keine Warnung, einfach ein für immer falsches Bild). Diese Funktion nimmt jede
 * eingehende Ansicht sofort an, ganz ohne Sichtbarkeits-Weiche — als eigene, isoliert testbare
 * Funktion, damit eine künftige "Optimierung" in diese Richtung hier auffiele statt sich
 * unbemerkt in den WebSocket-Handler einzuschleichen.
 */
export const dispatchStreamSceneFrame = (
    raw: string,
    onFrame: (() => void) | undefined,
    onView: (view: StreamSceneViewDto) => void,
): void => {
    if (isRecognizedStreamSceneFrame(raw)) onFrame?.()
    const view = parseStreamSceneMessage(raw)
    if (view !== null) onView(view)
}

/**
 * Welcher von zwei Szenenständen der jüngere ist — nach der SERVERZEIT, mit der jeder Stand
 * berechnet wurde, nicht nach seinem Eintreffen. Bühne und Regie-Board halten den letzten
 * Push und den letzten HTTP-Abruf nebeneinander: Ein Nachladen (etwa nach einem
 * Regie-Eingriff bei stehendem Kanal) muss einen alten Push überholen dürfen, und ein
 * verspäteter Erstabruf darf einen frischen Push nicht überdecken. Bei Gleichstand gewinnt
 * der Push — er ist der reguläre Weg.
 */
export const newerSceneView = (
    pushed: StreamSceneViewDto | null,
    fetched: StreamSceneViewDto | null,
): StreamSceneViewDto | null => {
    if (pushed === null) return fetched
    if (fetched === null) return pushed
    return Date.parse(fetched.serverTime) > Date.parse(pushed.serverTime) ? fetched : pushed
}
