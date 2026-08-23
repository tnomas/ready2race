import {useCallback, useEffect, useRef, useState} from 'react'
import {createStaleWatch} from '@utils/staleWatch.ts'
import {stretchedPollMs} from '@utils/eventChange/eventChangePush.ts'
import {useEventChangeSocket} from '@utils/eventChange/useEventChangeSocket.ts'

const FALLBACK_INTERVAL_SECONDS = 15
// Erst nach mehreren verpassten Takten wird aus einem alternden Stand eine Warnung — ein
// einzelner verpasster Abruf über Mobilfunk ist Alltag und soll nichts gelb färben. Wie viele
// es sein dürfen, entscheidet der Aufrufer: ein fest montierter Bildschirm, an dem niemand
// steht, meldet sich früher als ein Telefon in der Hand.
const DEFAULT_STALE_AFTER_MISSED_INTERVALS = 3

export interface PolledState<T> {
    data: T | null
    lastUpdated: Date | null
    notFound: boolean
    initialLoad: boolean
    // true, solange der letzte Versuch fehlgeschlagen ist (Backend tot, HTTP-Fehler,
    // kein Netz). Vor dem ersten Erfolg unterscheidet das Flag "geladen, aber leer" von
    // "nichts gewusst"; danach bleibt `data` als letzter guter Stand stehen und das Flag
    // trägt die Stand-von-Warnung — bewusstes Pausieren im Hintergrund zählt nicht als
    // Fehler, weil dabei gar kein Abruf stattfindet.
    loadFailed: boolean
    /**
     * true, sobald der letzte gute Stand drei Takte alt ist UND ein Abruf fehlgeschlagen ist.
     *
     * Bewusst hier und nicht beim Rendern der Anzeige ausgerechnet: Die Bedingung enthält die
     * Uhr, und nach dem ersten Fehlversuch rendert nichts mehr, was sie erneut prüfen würde.
     * Siehe [createStaleWatch].
     */
    stale: boolean
}

export type PolledEndpointOptions = {
    /**
     * Nach wie vielen verpassten (wirksamen) Takten ein alternder Stand zur Warnung wird —
     * siehe DEFAULT_STALE_AFTER_MISSED_INTERVALS.
     */
    staleAfterMissedIntervals?: number
    /**
     * Veranstaltung, deren Push-Kanal (`useEventChangeSocket`) den Takt ablöst: gemeldete
     * Änderungen laden sofort (entprellt) nach, und solange der Kanal steht, streckt sich der
     * Poll-Takt auf den Sicherheitstakt (`stretchedPollMs`). Ohne Angabe bleibt alles beim
     * reinen Takt.
     */
    pushEventId?: string
}

/**
 * Lädt einen Endpunkt im Takt, den der Server vorgibt.
 *
 * Drei Eigenschaften sind hier wichtiger als Kürze:
 * - Bei einem Netzabbruch bleibt der letzte gute Stand stehen. Ein fest montierter
 *   Bildschirm, der nach einem Aussetzer leer bleibt, ist der schlechteste Ausgang.
 * - Scheitert dagegen der allererste Abruf (also bevor je ein guter Stand da war),
 *   muss das von außen von "geladen, aber leer" unterscheidbar sein — sonst behauptet
 *   die Anzeige fälschlich, es sei kein Lauf in der Arena.
 * - Im Hintergrund wird nicht geladen; beim Zurückkehren sofort einmal.
 *
 * `deps` steuert ausschließlich, wann der Takt **neu beginnt** (also etwa bei einem Wechsel
 * der Veranstaltung) — nicht, welche Werte `load` und `intervalOf` sehen. Diese beiden
 * werden über Referenzen immer in ihrer neuesten Fassung aufgerufen. Ohne das müsste jeder
 * Aufrufer alle von ihnen erfassten Werte in `deps` auflisten, und ein vergessener Wert
 * ergäbe einen dauerhaft veralteten Aufruf ohne jede Warnung — die `exhaustive-deps`-Regel
 * kann das hier nicht prüfen, weil die Abhängigkeiten erst der Aufrufer kennt.
 */
export const usePolledEndpoint = <T>(
    load: (signal: AbortSignal) => Promise<{data?: T; response: Response}>,
    intervalOf: (data: T) => number,
    deps: unknown[],
    options: PolledEndpointOptions = {},
): PolledState<T> => {
    const staleAfterMissedIntervals =
        options.staleAfterMissedIntervals ?? DEFAULT_STALE_AFTER_MISSED_INTERVALS
    const [data, setData] = useState<T | null>(null)
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
    const [notFound, setNotFound] = useState(false)
    const [initialLoad, setInitialLoad] = useState(true)
    const [loadFailed, setLoadFailed] = useState(false)
    const [stale, setStale] = useState(false)

    const timerRef = useRef<number | null>(null)
    const intervalRef = useRef(FALLBACK_INTERVAL_SECONDS)
    const abortRef = useRef<AbortController | null>(null)
    const mountedRef = useRef(true)
    // Steht der Push-Kanal? Als Ref, nicht als Abhängigkeit: ein Verbindungswechsel darf den
    // Takt umstellen (Effekt unten), aber niemals den ganzen Poller neu aufziehen.
    const pushConnectedRef = useRef(false)
    // Nach einem 404 hält der Takt dauerhaft an — auch die Umstell-Effekte unten dürfen dann
    // keinen neuen Wecker stellen.
    const stopPollingRef = useRef(false)

    // Die Wache wird unten im selben Effekt angelegt wie der Takt und dort auch wieder
    // angehalten: Ihr Zeitgeber läuft zwischen den Abrufen weiter und ist gerade dann das
    // einzige, was noch tickt, wenn alle Abrufe scheitern — er darf einen Wechsel der
    // Veranstaltung oder das Abräumen der Anzeige aber nicht überleben.
    const staleWatchRef = useRef<ReturnType<typeof createStaleWatch> | null>(null)

    // Siehe Kommentar an der Funktion: die beiden Rückrufe werden stets in ihrer neuesten
    // Fassung aufgerufen, damit ein vom Aufrufer nicht in `deps` genannter Wert keinen
    // veralteten Aufruf ergibt.
    const loadRef = useRef(load)
    const intervalOfRef = useRef(intervalOf)
    const staleAfterMissedIntervalsRef = useRef(staleAfterMissedIntervals)
    loadRef.current = load
    intervalOfRef.current = intervalOf
    staleAfterMissedIntervalsRef.current = staleAfterMissedIntervals

    useEffect(() => {
        mountedRef.current = true
        return () => {
            mountedRef.current = false
        }
    }, [])

    const clearTimer = () => {
        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current)
            timerRef.current = null
        }
    }

    /** Der wirksame Takt in Millisekunden: gestreckt, solange der Push-Kanal steht. */
    const effectiveIntervalMs = () =>
        stretchedPollMs(intervalRef.current * 1000, pushConnectedRef.current)

    const runLoad = useCallback(async () => {
        abortRef.current?.abort()
        const controller = new AbortController()
        abortRef.current = controller

        // Ein falsch gedruckter QR-Code soll nicht dauerhaft gegen einen toten Endpoint
        // takten: nach einem 404 hält der Takt an, die Meldung bleibt stehen.
        let stopPolling = false

        try {
            const result = await loadRef.current(controller.signal)
            if (!mountedRef.current) return
            if (result.response.status === 404) {
                setNotFound(true)
                setLoadFailed(false)
                stopPolling = true
                stopPollingRef.current = true
            } else if (result.data) {
                setNotFound(false)
                setLoadFailed(false)
                setData(result.data)
                setLastUpdated(new Date())
                intervalRef.current = intervalOfRef.current(result.data)
                // Die Stand-von-Wache misst am WIRKSAMEN Takt: im gestreckten Betrieb wäre der
                // Grundtakt längst „verpasst", obwohl Kanal und Sicherheitstakt gesund sind.
                staleWatchRef.current?.markFresh(
                    effectiveIntervalMs() * staleAfterMissedIntervalsRef.current,
                )
            } else {
                // Antwort ohne Nutzdaten (z. B. HTTP 500): als fehlgeschlagenen Versuch werten,
                // statt ihn stillschweigend zu ignorieren.
                setLoadFailed(true)
                staleWatchRef.current?.markFailed()
            }
        } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') {
                // Ein neuerer load()-Aufruf hat diesen Abruf abgelöst — kein echter Fehler.
            } else if (mountedRef.current) {
                // Netzabbruch o.ä.: letzten guten Stand stehen lassen, aber als
                // fehlgeschlagenen Versuch markieren (siehe loadFailed oben).
                setLoadFailed(true)
                staleWatchRef.current?.markFailed()
            }
        } finally {
            // Wurde dieser Aufruf zwischenzeitlich durch einen neueren abgelöst, überlässt
            // er Timer und State vollständig dem neueren Aufruf.
            if (mountedRef.current && abortRef.current === controller) {
                setInitialLoad(false)
                clearTimer()
                if (!stopPolling && !document.hidden) {
                    timerRef.current = window.setTimeout(() => {
                        void runLoad()
                    }, effectiveIntervalMs())
                }
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps)

    // Für Rückrufe, die den Poller nicht neu aufziehen dürfen (Push-Kanal, Takt-Umstellung).
    const runLoadRef = useRef(runLoad)
    runLoadRef.current = runLoad

    // Der Push-Kanal der Veranstaltung: gemeldete Änderungen laden sofort nach (der Hook
    // entprellt Schübe und hält Hintergrund-Pushes zurück), Reconnects holen Verpasstes ab.
    const {connected: pushConnected} = useEventChangeSocket(options.pushEventId ?? null, () => {
        void runLoadRef.current()
    })

    useEffect(() => {
        pushConnectedRef.current = pushConnected
        // Ein bereits gestellter Wecker läuft noch im alten Takt — umstellen, ohne einen Abruf
        // auszulösen. Läuft gerade ein Abruf (kein Wecker), stellt dessen Abschluss den nächsten
        // Wecker ohnehin mit dem neuen Takt.
        if (timerRef.current !== null && !stopPollingRef.current && !document.hidden) {
            clearTimer()
            timerRef.current = window.setTimeout(() => {
                void runLoadRef.current()
            }, effectiveIntervalMs())
        }
    }, [pushConnected])

    useEffect(() => {
        // Andere Abhängigkeiten heißen: andere Daten. Eine Warnung, die zum vorigen Stand
        // gehörte, darf nicht über den Wechsel hinweg stehen bleiben.
        setStale(false)
        stopPollingRef.current = false
        staleWatchRef.current = createStaleWatch({
            onStale: value => {
                if (mountedRef.current) setStale(value)
            },
        })

        void runLoad()

        const onVisibilityChange = () => {
            if (document.hidden) {
                clearTimer()
            } else {
                void runLoad()
            }
        }

        document.addEventListener('visibilitychange', onVisibilityChange)
        return () => {
            document.removeEventListener('visibilitychange', onVisibilityChange)
            clearTimer()
            abortRef.current?.abort()
            staleWatchRef.current?.stop()
            staleWatchRef.current = null
        }
    }, [runLoad])

    return {data, lastUpdated, notFound, initialLoad, loadFailed, stale}
}
