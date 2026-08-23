import {useEffect, useRef, useState} from 'react'
import Config from '../../Config'
import {
    buildEventChangeWsUrl,
    createChangeDebouncer,
    parseEventChangeMessage,
    shouldRefetchOnConnect,
} from './eventChangePush'

const BASE_BACKOFF_MILLIS = 1000
const MAX_BACKOFF_MILLIS = 10000
const JITTER_RATIO = 0.2
const STABLE_CONNECTION_MILLIS = 10000

const backoffMillis = (attempt: number): number => {
    const capped = Math.min(BASE_BACKOFF_MILLIS * 2 ** attempt, MAX_BACKOFF_MILLIS)
    const jitter = capped * JITTER_RATIO * (Math.random() * 2 - 1)
    return capped + jitter
}

/**
 * Hält den Veranstaltungs-Kanal (`/api/ws/event/{eventId}/info`) offen und ruft [onRefresh],
 * wann immer die Anzeige neu laden soll: entprellt nach jedem gepushten Änderungsmarker
 * (Massen-Ergebniseingang lädt einmal, nicht achtmal — siehe `eventChangePush.ts`) und sofort
 * nach jedem Wiederverbinden, um verpasste Änderungen abzuholen.
 *
 * Der Kanal ist öffentlich wie die Anzeige-Endpunkte unter `/event/{eventId}/info` — kein Token,
 * kein Subprotokoll. Reconnect mit exponentiellem Backoff (1s/2s/4s, Deckel 10s, ±20% Jitter);
 * der Versuchszähler fällt erst zurück, wenn eine Verbindung eine Weile stand (ein Server, der
 * annimmt und sofort wieder trennt, soll nicht im Sekundentakt gehämmert werden).
 *
 * Sichtbarkeit: im Hintergrund werden Pushes nicht ausgeliefert, sondern vorgemerkt — die
 * Anzeigen laden im Hintergrund grundsätzlich nicht (siehe `usePolledEndpoint`/`polling.ts`).
 * Beim Zurückkehren feuert ein vorgemerkter Push sofort einmal.
 *
 * `connected` ist die Fallback-Entscheidung der Aufrufer: solange true, strecken sie ihr Polling
 * auf den Sicherheitstakt (`stretchedPollMs`); bei false gilt das heutige Verhalten unverändert.
 * Mit `eventId === null` tut der Hook nichts — für Flächen, die den Kanal nur bedingt nutzen.
 */
export const useEventChangeSocket = (
    eventId: string | null,
    onRefresh: () => void,
): {connected: boolean} => {
    const [connected, setConnected] = useState(false)

    // Immer die neueste Fassung rufen, ohne dass eine neue Funktions-Identität den Socket neu
    // aufbaut (dasselbe Muster wie beim Timing-Kanal).
    const onRefreshRef = useRef(onRefresh)
    useEffect(() => {
        onRefreshRef.current = onRefresh
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
        // Für shouldRefetchOnConnect: nur das allererste glatte Verbinden lädt nicht nach.
        let hadConnection = false
        let hadFailure = false
        // Ein Push, der im Hintergrund ankam — beim Zurückkehren einmal nachladen.
        let pendingWhileHidden = false

        const debouncer = createChangeDebouncer(() => {
            if (disposed) return
            if (document.hidden) {
                // Der Zünder kann noch feuern, nachdem der Tab in den Hintergrund ging.
                pendingWhileHidden = true
                return
            }
            onRefreshRef.current()
        })

        const clearStableTimer = () => {
            if (stableTimer !== null) {
                clearTimeout(stableTimer)
                stableTimer = null
            }
        }

        const connect = () => {
            if (disposed) return

            const url = buildEventChangeWsUrl(Config.api.baseUrl, window.location.href, eventId)
            let ws: WebSocket
            try {
                ws = new WebSocket(url)
            } catch {
                // Synchroner Fehlschlag (z.B. kaputte URL): wie jeder andere Verbindungsfehler
                // mit Backoff behandeln, statt schnell zu kreiseln.
                hadFailure = true
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

            const scheduleReconnect = () => {
                if (disposed || reconnectScheduled) return
                reconnectScheduled = true
                hadFailure = true
                clearStableTimer()
                cleanupSocket()
                setConnected(false)
                armReconnectTimer()
            }

            ws.onopen = () => {
                if (disposed) return
                setConnected(true)
                if (shouldRefetchOnConnect(hadConnection, hadFailure)) {
                    // Verpasste Änderungen sofort abholen — im Hintergrund nur vormerken.
                    if (document.hidden) {
                        pendingWhileHidden = true
                    } else {
                        onRefreshRef.current()
                    }
                }
                hadConnection = true
                // Den Versuchszähler erst nach einer stabilen Weile zurücksetzen: ein Server,
                // der annimmt und gleich wieder trennt, bekäme sonst dauerhaft den schnellsten
                // Backoff.
                clearStableTimer()
                stableTimer = setTimeout(() => {
                    attempt = 0
                    stableTimer = null
                }, STABLE_CONNECTION_MILLIS)
            }

            ws.onmessage = event => {
                if (disposed) return
                if (typeof event.data !== 'string') return
                if (parseEventChangeMessage(event.data) === null) return
                if (document.hidden) {
                    pendingWhileHidden = true
                    return
                }
                debouncer.bump()
            }

            ws.onclose = scheduleReconnect
            ws.onerror = scheduleReconnect
        }

        const armReconnectTimer = () => {
            const delay = backoffMillis(attempt)
            attempt += 1
            reconnectTimer = setTimeout(connect, delay)
        }

        const onVisibilityChange = () => {
            if (document.hidden || !pendingWhileHidden) return
            pendingWhileHidden = false
            onRefreshRef.current()
        }

        document.addEventListener('visibilitychange', onVisibilityChange)
        connect()

        return () => {
            disposed = true
            document.removeEventListener('visibilitychange', onVisibilityChange)
            debouncer.cancel()
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
    }, [eventId])

    return {connected}
}
