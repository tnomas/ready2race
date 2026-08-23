import {useEffect, useRef, useState} from 'react'
import {PollerState, Poller, createPoller, initialPollerState} from '@utils/polling.ts'
import {stretchedPollMs} from '@utils/eventChange/eventChangePush.ts'
import {useEventChangeSocket} from '@utils/eventChange/useEventChangeSocket.ts'

/**
 * Lädt im Hintergrund nach, ohne die Seite neu zu laden.
 *
 * Der Hook ist absichtlich nur Verdrahtung: was der Takt leistet — kein Überlappen, letzter guter
 * Stand bei Fehlern, Pause im Hintergrund — steht in [createPoller] und ist dort ohne DOM geprüft.
 * Hier kommen nur die beiden Ereignisse des Browsers dazu:
 *
 * - `visibilitychange`: im Hintergrund wird nicht getaktet; beim Zurückkehren sofort einmal.
 * - `online`: nach einem Funkloch soll der Stand nicht bis zum nächsten Takt alt bleiben.
 *
 * [load] darf sich bei jedem Rendern ändern (Pfeilfunktion im Aufrufer); der Takt wird deshalb
 * über [deps] gesteuert und nicht über die Identität der Funktion — sonst startete er bei jedem
 * Rendern neu.
 *
 * Mit [pushEventId] hört der Hook zusätzlich auf den Push-Kanal der Veranstaltung
 * (`useEventChangeSocket`): gemeldete Änderungen laden sofort (entprellt) nach, und solange der
 * Kanal steht, streckt sich der Takt auf den Sicherheitstakt (`stretchedPollMs`). Reißt der
 * Kanal ab, gilt unverändert der heutige Takt.
 */
export const usePolledFetch = <T,>(
    load: (signal: AbortSignal) => Promise<T | null>,
    intervalMs: number,
    deps: unknown[],
    pushEventId?: string,
): PollerState<T> => {
    const [state, setState] = useState<PollerState<T>>(initialPollerState<T>)

    const loadRef = useRef(load)
    loadRef.current = load

    // Der Takter lebt über einen Verbindungswechsel des Push-Kanals hinweg — der Kanal stellt
    // nur den Takt um und stößt Abrufe an, er zieht den Takter nie neu auf.
    const pollerRef = useRef<Poller | null>(null)
    const pushConnectedRef = useRef(false)

    const {connected: pushConnected} = useEventChangeSocket(pushEventId ?? null, () => {
        pollerRef.current?.refreshNow()
    })

    useEffect(() => {
        pushConnectedRef.current = pushConnected
        pollerRef.current?.setIntervalMs(stretchedPollMs(intervalMs, pushConnected))
    }, [pushConnected, intervalMs])

    useEffect(() => {
        // Neue Abhängigkeiten heißen: andere Daten. Der alte Stand gehörte zu einer anderen
        // Veranstaltung und darf nicht stehen bleiben.
        setState(initialPollerState<T>())

        const poller = createPoller<T>({
            load: signal => loadRef.current(signal),
            intervalMs,
            onState: setState,
        })
        pollerRef.current = poller
        // Steht der Kanal schon (der Takter wurde nur wegen anderer deps neu aufgezogen),
        // startet er direkt im gestreckten Takt — der Umstell-Effekt oben feuert ohne
        // Verbindungswechsel nicht noch einmal.
        poller.setIntervalMs(stretchedPollMs(intervalMs, pushConnectedRef.current))
        poller.start()
        // Hängt sich der Hook in einem bereits versteckten Tab ein, feuert kein
        // `visibilitychange` mehr - ohne diese Prüfung würde bis zur ersten Sichtbarkeitsänderung
        // trotzdem im Hintergrund weitergetaktet, im Widerspruch zum JSDoc oben. Der erste Abruf
        // aus `poller.start()` läuft trotzdem durch: `suspend()` hält nur den Timer für den
        // NÄCHSTEN Abruf an, sodass beim Zurückkehren schon Daten da sind.
        if (document.hidden) {
            poller.suspend()
        }

        const onVisibilityChange = () => {
            if (document.hidden) {
                poller.suspend()
            } else {
                poller.resume()
            }
        }
        const onOnline = () => poller.refreshNow()

        document.addEventListener('visibilitychange', onVisibilityChange)
        window.addEventListener('online', onOnline)
        return () => {
            document.removeEventListener('visibilitychange', onVisibilityChange)
            window.removeEventListener('online', onOnline)
            poller.stop()
            if (pollerRef.current === poller) {
                pollerRef.current = null
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [intervalMs, ...deps])

    return state
}
