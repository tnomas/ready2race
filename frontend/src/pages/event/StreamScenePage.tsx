import {useCallback, useEffect, useMemo, useState} from 'react'
import {Box} from '@mui/material'
import {getStreamSceneView} from '@api/sdk.gen'
import {StreamSceneViewDto} from '@api/types.gen'
import {useFetch} from '@utils/hooks.ts'
import {streamSceneRoute} from '@routes'
import {useStreamSceneSocket} from '@components/event/stream/useStreamSceneSocket.ts'
import {isStreamStale} from '@components/event/stream/streamStale.ts'
import {StreamStaleContext} from '@components/event/stream/StreamStaleContext.ts'
import StreamGraphic from '@components/event/stream/graphics/StreamGraphic.tsx'
import {
    stageScale,
    STREAM_STAGE_HEIGHT,
    STREAM_STAGE_WIDTH,
} from '@components/event/stream/stageScale.ts'
import {STREAM_PLACEMENTS, STREAM_SLOT_STYLE} from '@components/event/stream/streamPlacement.ts'

/** Vorgabe der Key-Farbe, wenn eine Szene mit Hintergrund CHROMA keine eigene Farbe trägt. */
const DEFAULT_CHROMA_COLOR = '#00FF00'

/** Schriftschnitte, die main.tsx bereits global einbindet (`@fontsource/roboto`). */
const PRELOAD_FONT_FACES = ['400 40px Roboto', '500 40px Roboto', '700 40px Roboto']

/**
 * Die Stream-Bühne: fest montierte 1920×1080-Entwurfsfläche, die eine Szene
 * (`/api/ws/event/{eventId}/stream/{sceneId}`) als OBS-/Wirecast-Quelle zeigt.
 *
 * Anders als die Board-Anzeige gibt es hier keinen Kopf, keinen Vollbild-Knopf und keine
 * Fehlertexte — eine Bühne läuft ungesehen im Hintergrund einer Regie, und JEDE sichtbare
 * Fläche außer den Grafiken selbst würde im Bild auftauchen. Bis eine erste Ansicht da ist
 * (egal ob vom Erstabruf oder vom Kanal), bleibt die Seite deshalb bewusst leer statt einen
 * Lade- oder Fehlerzustand zu zeigen.
 */
const StreamScenePage = () => {
    const {eventId, sceneId} = streamSceneRoute.useParams()

    const initial = useFetch(
        signal => getStreamSceneView({signal, path: {eventId, sceneId}}),
        {deps: [eventId, sceneId]},
    )

    const [pushed, setPushed] = useState<StreamSceneViewDto | null>(null)
    const [lastReceivedAt, setLastReceivedAt] = useState<number | null>(null)

    // Szenenwechsel macht den bisherigen Stand wertlos — er gehört zur vorigen Bühne.
    useEffect(() => {
        setPushed(null)
        setLastReceivedAt(null)
    }, [eventId, sceneId])

    useEffect(() => {
        if (initial.data) setLastReceivedAt(Date.now())
    }, [initial.data])

    const onView = useCallback(
        (view: StreamSceneViewDto) => {
            if (view.sceneId !== sceneId) return
            setPushed(view)
        },
        [sceneId],
    )
    // onFrame statt onView für die Veraltet-Erkennung: ein Herzschlag trägt keinen Stand, zählt
    // aber genauso als "der Kanal lebt" — sonst hielte eine ruhige, aber gesunde Szene (kein
    // Start, keine Zwischenzeit, kein Regie-Eingriff seit Minuten) `isStreamStale` fälschlich für
    // gestört, obwohl nur nichts zu melden war (siehe `StreamSceneBroadcaster.heartbeatLoop`).
    const onFrame = useCallback(() => setLastReceivedAt(Date.now()), [])
    useStreamSceneSocket(eventId, sceneId, onView, onFrame)

    // Der Kanal schickt den vollen Stand als ersten Rahmen jeder Verbindung — er überholt den
    // Erstabruf binnen kurzem von selbst. Bis dahin trägt der Erstabruf allein.
    const view = pushed ?? initial.data ?? null

    // Serverzeitversatz für die CLOCK-Bandgrafik: einmal je frisch eingetroffener Ansicht
    // gemessen (`serverTime` ändert sich nur bei einem echten neuen Stand), nicht bei jedem
    // Render — sonst würde jeder Uhr-/Countdown-Tick die Messung verfälschen. Dasselbe Muster
    // wie beim alten Chroma-Key-Overlay (`BoardStreamOverlayElement`).
    const clockOffsetMs = useMemo(
        () => (view ? Date.now() - Date.parse(view.serverTime) : 0),
        // Bewusst nur auf `serverTime` reagieren, nicht auf jede Referenzänderung von `view`
        // (jeder Push liefert ein neues Objekt) — sonst würde ein Push, der denselben
        // Serverzeitstempel trägt (kommt praktisch nicht vor, ist aber kein Fehlerfall), die
        // Messung unnötig wiederholen.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [view?.serverTime],
    )

    // Sekundentakt fürs Veraltet-Erkennen (Muster `useServerClock`) — kein Live-Rendering-Grund,
    // nur damit `stale` ohne neue Nachricht nach STREAM_STALE_AFTER_MS wirklich kippt.
    const [now, setNow] = useState(() => Date.now())
    useEffect(() => {
        const id = window.setInterval(() => setNow(Date.now()), 1000)
        return () => window.clearInterval(id)
    }, [])
    const stale = isStreamStale(lastReceivedAt, now)

    const [windowSize, setWindowSize] = useState(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
    }))
    useEffect(() => {
        const onResize = () => setWindowSize({width: window.innerWidth, height: window.innerHeight})
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
    }, [])
    const scale = stageScale(windowSize.width, windowSize.height)

    // Schriftschnitte vorladen, bevor Task 10–12 die ersten Grafiken mit Text füllen — ein FOUT
    // auf einer laufenden Sendung wäre sichtbar, das Nachladen jetzt kostet nichts.
    useEffect(() => {
        if (typeof document === 'undefined' || !('fonts' in document)) return
        for (const face of PRELOAD_FONT_FACES) {
            void document.fonts.load(face)
        }
    }, [])

    const background = view?.background ?? null

    // CssBaseline setzt eine deckende Hintergrundfarbe auf <body> — für eine echte
    // (nicht Chroma-Key-)Transparenz muss das Dokument selbst durchsichtig sein, sonst scheint
    // die Themenfarbe durch jede transparente Fläche dieser Seite hindurch. Bei CHROMA reicht
    // die deckende Vollfläche unten, dort bleibt <body> unangetastet (wie beim Board-Overlay,
    // `BoardStreamOverlayElement`).
    useEffect(() => {
        if (background !== 'TRANSPARENT') return
        const html = document.documentElement
        const body = document.body
        const prevHtml = html.style.backgroundColor
        const prevBody = body.style.backgroundColor
        html.style.backgroundColor = 'transparent'
        body.style.backgroundColor = 'transparent'
        return () => {
            html.style.backgroundColor = prevHtml
            body.style.backgroundColor = prevBody
        }
    }, [background])

    if (view === null) return null

    const pageBackground =
        view.background === 'TRANSPARENT' ? 'transparent' : (view.chromaColor ?? DEFAULT_CHROMA_COLOR)

    return (
        <Box sx={{position: 'fixed', inset: 0, overflow: 'hidden', bgcolor: pageBackground}}>
            <Box
                data-stale={stale}
                sx={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    width: STREAM_STAGE_WIDTH,
                    height: STREAM_STAGE_HEIGHT,
                    transform: `translate(-50%, -50%) scale(${scale})`,
                    transformOrigin: 'center center',
                }}>
                {/* Die Veraltet-Sperre reist als Kontext statt als Prop durch jede einzelne
                    Grafik — GraphicFrame liest sie über `useStreamStale` (siehe dort). */}
                <StreamStaleContext.Provider value={stale}>
                    <Box sx={{position: 'absolute', inset: `${view.safeAreaPercent}%`}}>
                        {STREAM_PLACEMENTS.map(placement => {
                            const graphicsAtPlacement = view.graphics.filter(
                                graphic => graphic.placement === placement,
                            )
                            return (
                                // STREAM_SLOT_STYLE statt eines ad-hoc zusammengesetzten Stils:
                                // Grid-Stapelung UND Zentrierung gehören zusammen entschieden
                                // (siehe dessen KDoc) — ein unbedachtes
                                // `{...STREAM_PLACEMENT_STYLE[placement], display: 'grid'}` hätte
                                // FULL_CENTERs Flex-Zentrierung durch Grids Stretch-Standard
                                // ersetzt und seinen Inhalt auf die volle Fläche gedehnt.
                                <Box key={placement} data-placement={placement} sx={STREAM_SLOT_STYLE[placement]}>
                                    {graphicsAtPlacement.map(graphic => (
                                        // `minWidth: 0` + `maxWidth: '100%'`: Ohne beides zöge eine
                                        // Grafik mit nicht umbrechbarem Inhalt (noWrap-Vereinsketten)
                                        // die Grid-Spur über die Platzbreite hinaus auf und ragte
                                        // über die Bühne — erst die Kappung zwingt die Zeilen in die
                                        // Ellipse statt über den Rand.
                                        <Box
                                            key={graphic.type}
                                            sx={{gridArea: '1 / 1', minWidth: 0, maxWidth: '100%'}}>
                                            <StreamGraphic graphic={graphic} clockOffsetMs={clockOffsetMs} />
                                        </Box>
                                    ))}
                                </Box>
                            )
                        })}
                    </Box>
                </StreamStaleContext.Provider>
            </Box>
        </Box>
    )
}

export default StreamScenePage
