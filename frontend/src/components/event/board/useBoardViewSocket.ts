import {useEffect, useRef, useState} from 'react'
import Config from '../../../Config'
import {BoardViewDto} from '@api/types.gen'
import {readSessionToken} from '@contexts/user/sessionToken.ts'
import {buildBoardViewWsUrl, parseBoardViewMessage} from './boardViewPush.ts'
import {boardDeviceToken} from '@utils/board/deviceToken.ts'

const BASE_BACKOFF_MILLIS = 1000
const MAX_BACKOFF_MILLIS = 10000
const JITTER_RATIO = 0.2
const STABLE_CONNECTION_MILLIS = 10000
const AUTH_FAILURE_CLOSE_CODE = 1008
/**
 * Wiederholtakt, solange die Anzeige nicht hineinkommt (kein Ausweis da, oder der Server weist
 * ihn ab). Bewusst langsam und ohne Jitter: das klärt sich nicht in einer Sekunde von selbst,
 * sondern erst, wenn jemand den Anzeigen-Link neu öffnet oder sich anmeldet — aber es klärt
 * sich OHNE Neuladen, und eine Anzeige, die bis zum nächsten Handgriff stumm bliebe, wäre auf
 * einem montierten Bildschirm die schlechteste aller Antworten.
 */
const UNAUTHORIZED_RETRY_MILLIS = 30000

const backoffMillis = (attempt: number): number => {
    const capped = Math.min(BASE_BACKOFF_MILLIS * 2 ** attempt, MAX_BACKOFF_MILLIS)
    const jitter = capped * JITTER_RATIO * (Math.random() * 2 - 1)
    return capped + jitter
}

/**
 * Hält den Board-Kanal (`/api/ws/event/{eventId}/board/{boardId}`) offen und reicht jede
 * gepushte Ansicht an [onView] weiter.
 *
 * Der Unterschied zum Veranstaltungs-Kanal (`useEventChangeSocket`) ist der ganze Punkt: dort
 * kommt ein Fingerzeig, auf den die Anzeige per HTTP nachlädt — hier kommt der fertige Stand,
 * der direkt eingesetzt wird. Für das Livestream-Overlay ist genau der Nachschlag die
 * spürbare Verzögerung gewesen.
 *
 * Anmeldung wie beim Zeitnahme-Kanal: Browser können beim Handshake keine eigenen Header
 * setzen, deshalb reist der Token im zweiten Eintrag des Subprotokolls
 * (`new WebSocket(url, ['r2r', token])`). Genommen wird die Nutzersitzung, und ohne sie das
 * Geräte-Token des geteilten Anzeigen-Links (`boardDeviceToken` aus der Ablage, die der geteilte
 * Link je Board füllt) — dieselben zwei Wege, die auch der HTTP-Endpunkt zulässt. Der Zuschnitt
 * ist eng und das ist Absicht: der Server prüft das Token gegen GENAU DIESES Board, ein Token der
 * Nachbaranzeige handelte sich nur eine abgewiesene Verbindung ein.
 *
 * Ohne beides wird gar nicht erst geklopft — stattdessen sieht
 * der Hook im langsamen Takt weiter hin ([UNAUTHORIZED_RETRY_MILLIS]), denn ein geteilter
 * Anzeigen-Link legt sein Token erst beim ersten Aufruf ab und eine Anmeldung im selben Tab soll
 * die Anzeige ohne Neuladen zurückholen. Bis dahin läuft die Anzeige auf ihrem Takt weiter, der
 * genau dafür nicht abgeschafft, sondern nur gestreckt wird.
 *
 * Reconnect mit exponentiellem Backoff (1s/2s/4s, Deckel 10s, ±20% Jitter); der Versuchszähler
 * fällt erst zurück, wenn eine Verbindung eine Weile stand (ein Server, der annimmt und sofort
 * wieder trennt, soll nicht im Sekundentakt gehämmert werden).
 *
 * Ein eigenes Nachladen nach dem Verbinden braucht dieser Kanal NICHT: der Server schickt den
 * vollen Stand von sich aus als ersten Rahmen jeder Verbindung (`boardViewSocket` in
 * `Sockets.kt`). Ein Reconnect nach einem Funkloch holt das Verpasste damit selbst ab; ein
 * zusätzlicher HTTP-Abruf wäre exakt die Doppelarbeit, die dieser Kanal abschaffen soll.
 *
 * Sichtbarkeit: im Hintergrund werden Pushes nicht angewendet, sondern vorgemerkt und beim
 * Zurückkehren einmal nachgeholt — die Anzeigen arbeiten im Hintergrund grundsätzlich nicht
 * (siehe `usePolledEndpoint`). Vorgemerkt wird nur der JÜNGSTE Stand; ältere sind wertlos, weil
 * jede Nachricht vollständig ist.
 *
 * Mit `eventId === null` tut der Hook nichts — so bleibt ein reines Uhr-/Text-Board ohne offene
 * Verbindung (siehe `boardNeedsRealtime`).
 */
export const useBoardViewSocket = (
    eventId: string | null,
    boardId: string,
    onView: (view: BoardViewDto) => void,
): {connected: boolean} => {
    const [connected, setConnected] = useState(false)

    // Immer die neueste Fassung rufen, ohne dass eine neue Funktions-Identität den Socket neu
    // aufbaut (dasselbe Muster wie bei den beiden anderen Kanälen).
    const onViewRef = useRef(onView)
    useEffect(() => {
        onViewRef.current = onView
    })

    useEffect(() => {
        if (eventId === null) {
            setConnected(false)
            return
        }

        let disposed = false
        let socket: WebSocket | null = null
        let reconnectTimer: ReturnType<typeof setTimeout> | null = null
        let stableTimer: ReturnType<typeof setTimeout> | null = null
        let attempt = 0
        // Ein Stand, der im Hintergrund ankam — beim Zurückkehren einmal anwenden.
        let pendingWhileHidden: BoardViewDto | null = null
        // Gesetzt von [armUnauthorizedRetry], zurückgenommen erst, wenn eine daraufhin
        // aufgebaute Verbindung STABLE_CONNECTION_MILLIS übersteht (siehe onopen).
        let wasUnauthorized = false

        const clearStableTimer = () => {
            if (stableTimer !== null) {
                clearTimeout(stableTimer)
                stableTimer = null
            }
        }

        const connect = () => {
            if (disposed) return

            // Sitzungstoken beider Oberflächen, sonst das Geräte-Token des geteilten
            // Anzeigen-Links. Reihenfolge wie beim Zeitnahme-Kanal: eine echte Sitzung sticht,
            // das Geräte-Token trägt die Bildschirme ohne Anmeldung.
            const token =
                readSessionToken(true) ??
                readSessionToken(false) ??
                boardDeviceToken(eventId, boardId)
            if (token === null) {
                // Ohne Ausweis gar nicht erst klopfen — aber weiter hinsehen: der geteilte
                // Anzeigen-Link legt sein Token erst beim ersten Aufruf ab, und eine Anmeldung
                // im selben Tab soll die Anzeige ohne Neuladen zurückholen.
                armUnauthorizedRetry()
                return
            }

            const url = buildBoardViewWsUrl(
                Config.api.baseUrl,
                window.location.href,
                eventId,
                boardId,
            )
            let ws: WebSocket
            try {
                ws = new WebSocket(url, ['r2r', token])
            } catch {
                // Synchroner Fehlschlag (z.B. kaputte URL): wie jeder andere Verbindungsfehler
                // mit Backoff behandeln, statt schnell zu kreiseln.
                armReconnectTimer()
                return
            }
            socket = ws
            // Ein Verbindungsfehler feuert onerror UND onclose — pro kaputter Verbindung darf
            // nur ein Reconnect geplant werden.
            let reconnectScheduled = false

            const cleanupSocket = () => {
                try {
                    ws.onopen = null
                    ws.onmessage = null
                    ws.onclose = null
                    ws.onerror = null
                    ws.close()
                } catch {
                    // Fehler beim Schließen einer ohnehin toten Verbindung sind egal.
                }
            }

            const scheduleReconnect = (event?: CloseEvent) => {
                if (disposed || reconnectScheduled) return
                reconnectScheduled = true
                clearStableTimer()
                cleanupSocket()
                setConnected(false)
                // Der Server schließt eine abgewiesene Verbindung mit 1008 — und zwar ERST NACH
                // dem Upgrade, onopen ist also schon gefeuert. Das ist kein Netzfehler, der sich
                // durch schnelles Wiederholen behebt: ein widerrufenes Geräte-Token bleibt
                // widerrufen. Deshalb der langsame Takt statt des Backoffs.
                if (event?.code === AUTH_FAILURE_CLOSE_CODE) {
                    armUnauthorizedRetry()
                } else {
                    armReconnectTimer()
                }
            }

            ws.onopen = () => {
                if (disposed) return
                // Einem nackten onopen wird nicht getraut, wenn wir aus dem Abgewiesen-Zustand
                // kommen: die 1008 folgt erst danach, und ein kurzes „verbunden" würde den
                // Poll-Takt strecken (siehe usePolledEndpoint) — ausgerechnet dann, wenn die
                // Anzeige nur noch den Takt hat.
                if (!wasUnauthorized) setConnected(true)
                // Kein Nachladen: der erste Rahmen des Servers IST der volle Stand.
                clearStableTimer()
                stableTimer = setTimeout(() => {
                    attempt = 0
                    stableTimer = null
                    if (wasUnauthorized) {
                        // Die Verbindung hat gehalten, die 1008 kam nicht: die Anzeige ist
                        // zurück.
                        wasUnauthorized = false
                        if (!disposed) setConnected(true)
                    }
                }, STABLE_CONNECTION_MILLIS)
            }

            ws.onmessage = event => {
                if (disposed) return
                if (typeof event.data !== 'string') return
                const view = parseBoardViewMessage(event.data)
                if (view === null) return
                if (document.hidden) {
                    pendingWhileHidden = view
                    return
                }
                onViewRef.current(view)
            }

            ws.onclose = event => scheduleReconnect(event)
            ws.onerror = () => scheduleReconnect()
        }

        const armReconnectTimer = () => {
            // Ein gewöhnlicher Verbindungsfehler sagt nichts über den Ausweis aus.
            wasUnauthorized = false
            const delay = backoffMillis(attempt)
            attempt += 1
            reconnectTimer = setTimeout(connect, delay)
        }

        /**
         * Langsam weiterprobieren, ohne den Backoff-Zähler anzufassen: das hier ist keine
         * Überlastbremse, und ein späterer echter Verbindungsfehler soll wieder mit dem
         * schnellen Takt beginnen.
         */
        const armUnauthorizedRetry = () => {
            wasUnauthorized = true
            setConnected(false)
            reconnectTimer = setTimeout(connect, UNAUTHORIZED_RETRY_MILLIS)
        }

        const onVisibilityChange = () => {
            if (document.hidden || pendingWhileHidden === null) return
            const view = pendingWhileHidden
            pendingWhileHidden = null
            onViewRef.current(view)
        }

        document.addEventListener('visibilitychange', onVisibilityChange)
        connect()

        return () => {
            disposed = true
            document.removeEventListener('visibilitychange', onVisibilityChange)
            if (reconnectTimer !== null) clearTimeout(reconnectTimer)
            if (stableTimer !== null) clearTimeout(stableTimer)
            if (socket !== null) {
                socket.onopen = null
                socket.onmessage = null
                socket.onclose = null
                socket.onerror = null
                socket.close()
            }
            setConnected(false)
        }
    }, [eventId, boardId])

    return {connected}
}
