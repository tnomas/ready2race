import {useEffect, useRef, useState} from 'react'
import Config from '../../../Config'
import {StreamSceneViewDto} from '@api/types.gen'
import {buildStreamSceneWsUrl, dispatchStreamSceneFrame} from './streamScenePush.ts'
import {streamSceneDeviceToken} from '@utils/stream/sceneToken.ts'
import {isInAppSurface, socketTokens} from '@utils/timing/socketTokens.ts'

const BASE_BACKOFF_MILLIS = 1000
const MAX_BACKOFF_MILLIS = 10000
const JITTER_RATIO = 0.2
const STABLE_CONNECTION_MILLIS = 10000
const AUTH_FAILURE_CLOSE_CODE = 1008
/**
 * Wiederholtakt, solange die Bühne nicht hineinkommt (kein Ausweis da, oder der Server weist ihn
 * ab). Bewusst langsam und ohne Jitter — Begründung wie beim Board-Vorbild
 * (`useBoardViewSocket`): das klärt sich nicht in einer Sekunde von selbst, aber es klärt sich
 * OHNE Neuladen, sobald jemand den Bühnen-Link neu öffnet oder sich anmeldet.
 */
const UNAUTHORIZED_RETRY_MILLIS = 30000
/** Pause vor dem Versuch mit dem NÄCHSTEN Ausweis derselben Runde (siehe [socketTokens]). */
const ALTERNATE_TOKEN_RETRY_MILLIS = 250

const backoffMillis = (attempt: number): number => {
    const capped = Math.min(BASE_BACKOFF_MILLIS * 2 ** attempt, MAX_BACKOFF_MILLIS)
    const jitter = capped * JITTER_RATIO * (Math.random() * 2 - 1)
    return capped + jitter
}

/**
 * Hält den Szenen-Kanal (`/api/ws/event/{eventId}/stream/{sceneId}`) offen und reicht jede
 * gepushte Ansicht an [onView] weiter.
 *
 * Wortgetreue Kopie von `useBoardViewSocket` für die Bühne statt eines Boards — dieselbe
 * Anmeldung (Nutzersitzung, sonst das Geräte-Token des geteilten Bühnen-Links über
 * `sceneToken.ts`), derselbe Reconnect mit exponentiellem Backoff, derselbe langsame Takt nach
 * einer 1008-Abweisung. Der einzige inhaltliche Unterschied zum Board-Vorbild: Eine Bühne braucht
 * IMMER den Kanal — anders als ein reines Uhr-/Text-Board gibt es keine Szene ohne Echtzeitbezug,
 * die Verbindung wird deshalb nicht erst nach einer geladenen Konfiguration entschieden.
 *
 * Kein eigenes Nachladen nach dem Verbinden nötig: der Server schickt den vollen Stand von sich
 * aus als ersten Rahmen jeder Verbindung (siehe `StreamSceneViewDto`-Dokumentation). Ein
 * Reconnect nach einem Funkloch holt das Verpasste damit selbst ab.
 *
 * [onFrame] feuert für JEDEN erkannten Rahmen — Zustand UND Herzschlag gleichermaßen. Gedacht für
 * die Veraltet-Erkennung (Bühne: `isStreamStale`, Panel: `isPanelStale`) — beide dürfen NUR den
 * Zeitpunkt zählen, nie den Inhalt lesen, sonst bräuchten sie den Umweg über [onView] und
 * verpassten den Herzschlag.
 *
 * Jede eingehende Ansicht wird SOFORT angewendet, ganz ohne Sichtbarkeits-Bedingung — anders als
 * beim Board-Vorbild (`useBoardViewSocket`), das eine Ansicht im Hintergrund-Tab zurückstellt.
 * Das trägt für eine Kontroll-Oberfläche, die ein Mensch tatsächlich wegschaltet; es ist für
 * eine Aufnahmequelle fatal, weil Wirecast/CEF-Browserquellen ihr Dokument oft dauerhaft als
 * `document.hidden` melden, obwohl sie aktiv aufnehmen — die Bühne fröre damit für immer auf dem
 * ersten Stand ein, während der Herzschlag die Veraltet-Erkennung weiter für gesund hielte.
 * Siehe `dispatchStreamSceneFrame` in `streamScenePush.ts` für die (isoliert getestete) Regel.
 */
export const useStreamSceneSocket = (
    eventId: string,
    sceneId: string,
    onView: (view: StreamSceneViewDto) => void,
    onFrame?: () => void,
): {connected: boolean} => {
    const [connected, setConnected] = useState(false)

    // Immer die neueste Fassung rufen, ohne dass eine neue Funktions-Identität den Socket neu
    // aufbaut (dasselbe Muster wie beim Board- und Veranstaltungs-Kanal).
    const onViewRef = useRef(onView)
    useEffect(() => {
        onViewRef.current = onView
    })
    const onFrameRef = useRef(onFrame)
    useEffect(() => {
        onFrameRef.current = onFrame
    })

    useEffect(() => {
        let disposed = false
        let socket: WebSocket | null = null
        let reconnectTimer: ReturnType<typeof setTimeout> | null = null
        let stableTimer: ReturnType<typeof setTimeout> | null = null
        let attempt = 0
        let deferConnectedUntilStable = false
        let rejectedTokens = new Set<string>()

        /**
         * Der nächste ungetestete Ausweis: die Sitzung der eigenen Oberfläche, dann die der
         * anderen, zuletzt das Geräte-Token DIESER Szene.
         */
        const nextToken = (): string | null =>
            socketTokens(isInAppSurface(), streamSceneDeviceToken(eventId, sceneId)).find(
                token => !rejectedTokens.has(token),
            ) ?? null

        const clearStableTimer = () => {
            if (stableTimer !== null) {
                clearTimeout(stableTimer)
                stableTimer = null
            }
        }

        const connect = () => {
            if (disposed) return

            const token = nextToken()
            if (token === null) {
                armUnauthorizedRetry()
                return
            }

            const url = buildStreamSceneWsUrl(
                Config.api.baseUrl,
                window.location.href,
                eventId,
                sceneId,
            )
            let ws: WebSocket
            try {
                ws = new WebSocket(url, ['r2r', token])
            } catch {
                armReconnectTimer()
                return
            }
            socket = ws
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
                if (event?.code === AUTH_FAILURE_CLOSE_CODE) {
                    rejectedTokens.add(token)
                    if (nextToken() !== null) {
                        armAlternateTokenRetry()
                    } else {
                        armUnauthorizedRetry()
                    }
                } else {
                    armReconnectTimer()
                }
            }

            ws.onopen = () => {
                if (disposed) return
                if (!deferConnectedUntilStable) setConnected(true)
                clearStableTimer()
                stableTimer = setTimeout(() => {
                    attempt = 0
                    stableTimer = null
                    rejectedTokens = new Set()
                    if (deferConnectedUntilStable) {
                        deferConnectedUntilStable = false
                        if (!disposed) setConnected(true)
                    }
                }, STABLE_CONNECTION_MILLIS)
            }

            ws.onmessage = event => {
                if (disposed) return
                if (typeof event.data !== 'string') return
                dispatchStreamSceneFrame(event.data, onFrameRef.current, onViewRef.current)
            }

            ws.onclose = event => scheduleReconnect(event)
            ws.onerror = () => scheduleReconnect()
        }

        const armReconnectTimer = () => {
            deferConnectedUntilStable = false
            const delay = backoffMillis(attempt)
            attempt += 1
            reconnectTimer = setTimeout(connect, delay)
        }

        const armUnauthorizedRetry = () => {
            deferConnectedUntilStable = true
            rejectedTokens = new Set()
            setConnected(false)
            reconnectTimer = setTimeout(connect, UNAUTHORIZED_RETRY_MILLIS)
        }

        const armAlternateTokenRetry = () => {
            deferConnectedUntilStable = true
            reconnectTimer = setTimeout(connect, ALTERNATE_TOKEN_RETRY_MILLIS)
        }

        connect()

        return () => {
            disposed = true
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
    }, [eventId, sceneId])

    return {connected}
}
