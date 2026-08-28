import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {Box, MenuItem, TextField, Typography} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {format} from 'date-fns'
import {
    getStreamPickerMatches,
    getStreamSceneView,
    getStreamScenes,
    setStreamSceneTrialMode,
} from '@api/sdk.gen.ts'
import {StreamPickerMatchDto, StreamSceneViewDto} from '@api/types.gen.ts'
import {useFeedback, useFetch} from '@utils/hooks.ts'
import {useUser} from '@contexts/user/UserContext.ts'
import {updateEventGlobal, updateStreamGlobal} from '@authorization/privileges.ts'
import {useStreamSceneSocket} from '@components/event/stream/useStreamSceneSocket.ts'
import StreamPanelHealth from '@components/event/stream/panel/StreamPanelHealth.tsx'
import StreamPanelGraphicCard, {
    StreamPanelMatchOption,
} from '@components/event/stream/panel/StreamPanelGraphicCard.tsx'
import {matchOptionLabel} from '@components/event/stream/panel/streamPanelMatchOptions.ts'
import {useDocumentTitle} from '@utils/useDocumentTitle.ts'

type Props = {eventId: string}

/**
 * Sicherheitstakt für die Lauf-Liste, ZUSÄTZLICH zum sofortigen Nachladen bei Kanal-Reconnect
 * unten — eine Regatta läuft über Stunden, ein einmaliger Abruf beim Öffnen des Panels würde mit
 * jedem beendeten/neu angesetzten Lauf veralten. 60 s ist grobkörnig genug (keine Live-Anzeige,
 * nur ein Wähler), siehe Prüfungshinweis "Match list one-shot snapshot".
 */
const MATCHES_REFRESH_MS = 60_000
/** Grobkörniger Sekundentakt fürs Sendepause-Erkennen — kein Live-Rendering-Grund. */
const CLOCK_TICK_MS = 1_000

/**
 * Das Kontroll-Panel: Szenen-Auswahl oben, darunter je aktiver Grafik der gewählten Szene eine
 * Karte. Abonniert denselben Kanal wie die Bühne (`useStreamSceneSocket`) — das Panel zeigt per
 * Konstruktion GENAU den Stand, den die Bühne gerade sendet, niemals einen eigenen, davon
 * abweichenden Zwischenstand.
 */
const StreamPanelPage = ({eventId}: Props) => {
    const {t} = useTranslation()
    useDocumentTitle(t('event.stream.panel.title'))
    const feedback = useFeedback()
    const user = useUser()
    const canEdit = user.checkPrivilege(updateStreamGlobal) || user.checkPrivilege(updateEventGlobal)

    const {data: scenes} = useFetch(signal => getStreamScenes({signal, path: {eventId}}), {
        deps: [eventId],
    })

    const [sceneId, setSceneId] = useState<string | null>(null)
    // Erste Szene vorwählen, sobald die Liste da ist. Läuft nur einmal an: ein Betrieb, der
    // danach selbst umschaltet, soll nicht auf die erste Szene zurückspringen, sobald die Liste
    // aus einem anderen Grund (z. B. Anlegen einer weiteren Szene) neu lädt.
    useEffect(() => {
        if (sceneId === null && scenes && scenes.length > 0) setSceneId(scenes[0].id)
    }, [scenes, sceneId])

    return (
        <Box sx={{width: '100%', maxWidth: 1200, mx: 'auto', px: 1, py: 2}}>
            <Typography variant="h5" sx={{mb: 2}}>
                {t('event.stream.panel.title')}
            </Typography>

            {scenes && scenes.length === 0 && (
                <Typography color="text.secondary">{t('event.stream.scenes.none')}</Typography>
            )}

            {scenes && scenes.length > 0 && (
                <TextField
                    select
                    fullWidth
                    label={t('event.stream.panel.sceneSelect')}
                    value={sceneId ?? ''}
                    onChange={e => setSceneId(e.target.value)}
                    sx={{mb: 3, maxWidth: {sm: 420}}}>
                    {scenes.map(scene => (
                        <MenuItem key={scene.id} value={scene.id}>
                            {scene.name}
                        </MenuItem>
                    ))}
                </TextField>
            )}

            {sceneId !== null && (
                <StreamPanelSceneView
                    key={sceneId}
                    eventId={eventId}
                    sceneId={sceneId}
                    sceneName={scenes?.find(s => s.id === sceneId)?.name ?? ''}
                    canEdit={canEdit}
                    feedback={feedback}
                />
            )}
        </Box>
    )
}

type SceneViewProps = {
    eventId: string
    sceneId: string
    sceneName: string
    canEdit: boolean
    feedback: ReturnType<typeof useFeedback>
}

/**
 * Der eigentliche Panel-Inhalt EINER Szene — als eigene Komponente mit `key={sceneId}` von
 * außen gemountet, damit ein Szenenwechsel seinen ganzen Zustand (gepushter Stand, Zeitpunkt des
 * letzten Rahmens, Kanal-Verbindung) sauber neu aufbaut, statt ihn manuell zurückzusetzen.
 */
const StreamPanelSceneView = ({eventId, sceneId, sceneName, canEdit, feedback}: SceneViewProps) => {
    const {t} = useTranslation()

    const initial = useFetch(signal => getStreamSceneView({signal, path: {eventId, sceneId}}), {
        deps: [eventId, sceneId],
    })

    const [pushed, setPushed] = useState<StreamSceneViewDto | null>(null)
    const [lastReceivedAt, setLastReceivedAt] = useState<number | null>(null)

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
    // aber genauso als "der Kanal lebt" — sonst hielte eine ruhige, aber gesunde Szene die
    // Panel-Warnung fälschlich für eine Störung (siehe `StreamSceneBroadcaster.heartbeatLoop`).
    const onFrame = useCallback(() => setLastReceivedAt(Date.now()), [])
    const {connected} = useStreamSceneSocket(eventId, sceneId, onView, onFrame)

    // Der Kanal schickt den vollen Stand als ersten Rahmen jeder Verbindung — er überholt den
    // Erstabruf binnen kurzem von selbst (wortgetreu wie `StreamScenePage`).
    const view = pushed ?? initial.data ?? null

    const clockOffsetMs = useMemo(
        () => (view ? Date.now() - Date.parse(view.serverTime) : 0),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [view?.serverTime],
    )

    const [now, setNow] = useState(() => Date.now())
    useEffect(() => {
        const id = window.setInterval(() => setNow(Date.now()), CLOCK_TICK_MS)
        return () => window.clearInterval(id)
    }, [])

    // Läufe des Tages für den Lauf-Wähler der Inhaltsgrafiken — die eigene Panel-Quelle
    // (getStreamPickerMatches), NICHT die öffentliche `getLiveMatches`: die lässt einen Lauf
    // fallen, sobald er beendet ist, und genau "Ergebnis von Lauf 12 erneut zeigen" ist der
    // Leitfall dieses Wählers. Bereits vom Server finished-zuerst, dann laufend, dann anstehend
    // sortiert (siehe dortige KDoc) — hier wird nicht noch einmal sortiert.
    //
    // Zwei unabhängige Auffrisch-Wege: ein 60-Sekunden-Sicherheitstakt (die Liste veraltet sonst
    // über eine mehrstündige Regatta) UND ein sofortiger Nachschlag, sobald der Szenen-Kanal
    // nach einem Funkloch wieder verbunden ist (unten) — ein einmaliger Abruf beim Öffnen des
    // Panels reicht nicht.
    const matchesData = useFetch(
        signal => getStreamPickerMatches({signal, path: {eventId}}),
        {deps: [eventId], preCondition: () => canEdit, autoReloadInterval: MATCHES_REFRESH_MS},
    )
    const matchOptions: StreamPanelMatchOption[] = useMemo(() => {
        const matches: StreamPickerMatchDto[] = matchesData.data ?? []
        return matches.map(m => ({
            id: m.matchId,
            label: matchOptionLabel(m, m.startTime ? format(new Date(m.startTime), t('format.time')) : null),
        }))
    }, [matchesData.data, t])

    // Reconnect-Auffrischung: `reload` wäre in den Abhängigkeiten instabil (useFetch baut die
    // Funktion jedes Rendern neu) - eine Ref hält immer die jüngste Fassung, dasselbe Muster wie
    // `onViewRef`/`onFrameRef` im Kanal-Hook selbst.
    const reloadMatchesRef = useRef(matchesData.reload)
    useEffect(() => {
        reloadMatchesRef.current = matchesData.reload
    })
    const wasConnectedRef = useRef(connected)
    useEffect(() => {
        if (connected && !wasConnectedRef.current) reloadMatchesRef.current()
        wasConnectedRef.current = connected
    }, [connected])

    const [togglingTrialMode, setTogglingTrialMode] = useState(false)
    const handleToggleTrialMode = async () => {
        if (view === null) return
        setTogglingTrialMode(true)
        try {
            const {error} = await setStreamSceneTrialMode({
                path: {eventId, sceneId},
                query: {trialMode: !view.trialMode},
            })
            if (error) feedback.error(t('event.stream.scenes.trialMode.error'))
        } finally {
            setTogglingTrialMode(false)
        }
    }

    if (view === null) return null

    return (
        <>
            <StreamPanelHealth
                sceneName={sceneName}
                lastReceivedAt={lastReceivedAt}
                now={now}
                trialMode={view.trialMode}
                canEdit={canEdit}
                togglingTrialMode={togglingTrialMode}
                onToggleTrialMode={() => void handleToggleTrialMode()}
            />

            {view.graphics.length === 0 ? (
                <Typography color="text.secondary">{t('event.stream.panel.noGraphics')}</Typography>
            ) : (
                <Box
                    sx={{
                        display: 'grid',
                        gap: 2,
                        gridTemplateColumns: {xs: '1fr', md: 'repeat(2, 1fr)'},
                    }}>
                    {view.graphics.map(graphic => (
                        <StreamPanelGraphicCard
                            key={graphic.type}
                            eventId={eventId}
                            sceneId={sceneId}
                            graphic={graphic}
                            matchOptions={matchOptions}
                            safeAreaPercent={view.safeAreaPercent}
                            clockOffsetMs={clockOffsetMs}
                            canEdit={canEdit}
                        />
                    ))}
                </Box>
            )}
        </>
    )
}

export default StreamPanelPage
