import {useCallback, useEffect, useRef, useState} from 'react'
import {getTimingSettings} from '@api/sdk.gen.ts'
import {TimingSettingsDto} from '@api/types.gen.ts'
import {DEFAULT_CAPTURE_TONE, DEFAULT_FALSE_START_SEQUENCE} from '@utils/timing/tonePlan.ts'
import {DEFAULT_START_DISPLAY} from '@utils/timing/startDisplay.ts'

export type UseTimingSettingsResult = {
    /**
     * Der aktuelle Einstellungs-Stand. Vor dem ersten erfolgreichen Laden gelten die
     * Server-Vorgaben (Übernahme an, ZEHNTEL) — dieselben Werte, die eine frische Veranstaltung
     * hätte, damit die Anzeige nie ohne Genauigkeit dasteht.
     */
    settings: TimingSettingsDto
    /** True, solange noch kein Stand vom Server geladen wurde (Schalter deaktiviert anzeigen). */
    loading: boolean
    /** True, wenn das letzte Laden fehlschlug — Banner-Fall. */
    error: boolean
    /** Vom Server neu laden (Reconnect, Sichtbarkeitswechsel). */
    reload: () => void
    /**
     * Den Stand einer `settingsChanged`-Websocket-Nachricht (oder einer optimistischen lokalen
     * Änderung) übernehmen. Stabil über Renders, damit er als Callback durchgereicht werden kann.
     */
    applyChanged: (settings: TimingSettingsDto) => void
}

/**
 * Die Server-Vorgaben einer frischen Veranstaltung — siehe Migrationen V202608211440/V202608211450,
 * (Erfassungstöne, V202608211470) den eingebauten Standardton aus `tonePlan.ts` und
 * (Anzeige, V202608242000) den Standard-Anzeigeblock aus `startDisplay.ts`.
 *
 * Die Anzeige-Felder gehören von Anfang an dazu: Der Startbildschirm zeichnet mit diesem Stand,
 * bevor der erste Fetch zurück ist. Fehlten sie hier, liefe er für einen Wimpernschlag gegen
 * `undefined` — auf einem Bildschirm am Steg heißt das ein sichtbares Aufflackern, und genau das
 * soll die Vorbelegung verhindern.
 */
const DEFAULT_SETTINGS: TimingSettingsDto = {
    autoApply: true,
    precision: 'ZEHNTEL',
    finishTone: DEFAULT_CAPTURE_TONE,
    splitTone: DEFAULT_CAPTURE_TONE,
    falseStartTone: [...DEFAULT_FALSE_START_SEQUENCE],
    // Der manuelle Stempel am START-Posten ist standardmäßig verborgen: er stünde sonst als
    // zweite grüne „Start"-Fläche direkt unter dem Sequenz-Knopf.
    showManualCapture: false,
    startDisplay: {...DEFAULT_START_DISPLAY},
    // Der Rückfall der Töne für alles, was zu keiner Partie gehört — allen voran der große
    // Erfassungsknopf, der eine Zeit OHNE Zuordnung bankt. Er muss auch in diesem Wimpernschlag
    // vor dem ersten Fetch klingen, deshalb stehen hier die eingebauten Standardtöne und nicht
    // etwa nichts: Ein stummer Knopf liest sich am Wasser als Fehler.
    defaultToneSet: {
        // null heißt „eingebauter Countdown" — den kennen nur die Boards (DEFAULT_START_TONE_PLAN).
        sequenceTonePlan: null,
        finishTone: DEFAULT_CAPTURE_TONE,
        splitTone: DEFAULT_CAPTURE_TONE,
        falseStartTone: [...DEFAULT_FALSE_START_SEQUENCE],
        tonePerBoat: true,
    },
}

/**
 * Die Zeitnahme-Einstellungen der Veranstaltung (Schalter „Automatische Übernahme" + Genauigkeit),
 * einmal per GET geladen und danach live aus den `settingsChanged`-Nachrichten des Timing-Kanals
 * gehalten. Läuft wie GET /officialTimes auch mit Geräte-Token — die Boards brauchen die
 * Genauigkeit für die Anzeige der offiziellen Zeiten.
 *
 * Kein Replay-Puffer wie bei `useOfficialTimes`: die Einstellungen sind ein einzelner Datensatz,
 * dessen letzte Nachricht immer den kompletten Stand trägt — eine verpasste ältere Nachricht kann
 * nichts kaputt machen, und der Reconnect-Reload holt den aktuellen Stand ohnehin.
 */
export function useTimingSettings(eventId: string): UseTimingSettingsResult {
    const [settings, setSettings] = useState<TimingSettingsDto>(DEFAULT_SETTINGS)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(false)

    const disposedRef = useRef(false)
    /** Monotonic reload counter — nur der jüngste laufende Reload darf seine Antwort anwenden. */
    const epochRef = useRef(0)

    useEffect(() => {
        disposedRef.current = false
        return () => {
            disposedRef.current = true
        }
    }, [])

    const reload = useCallback(() => {
        const epoch = ++epochRef.current
        void (async () => {
            try {
                const {data, error: requestError} = await getTimingSettings({path: {eventId}})
                if (disposedRef.current || epoch !== epochRef.current) return
                setLoading(false)
                if (requestError !== undefined || data === undefined) {
                    setError(true)
                    return
                }
                setError(false)
                setSettings(data)
            } catch {
                if (disposedRef.current || epoch !== epochRef.current) return
                setLoading(false)
                setError(true)
            }
        })()
    }, [eventId])

    const applyChanged = useCallback((changed: TimingSettingsDto) => {
        // Eine Live-Nachricht ist so autoritativ wie ein GET — ab jetzt gibt es einen Stand.
        setLoading(false)
        setSettings(changed)
    }, [])

    // Ereigniswechsel: Vorgaben zurück, laufende Antwort des alten Events entwerten, neu laden.
    useEffect(() => {
        epochRef.current += 1
        setSettings(DEFAULT_SETTINGS)
        setLoading(true)
        setError(false)
        reload()
    }, [reload])

    return {settings, loading, error, reload, applyChanged}
}
