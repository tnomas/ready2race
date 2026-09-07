import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {Box, Button, CssBaseline, Stack, ThemeProvider, Typography, useTheme} from '@mui/material'
import LinkIcon from '@mui/icons-material/Link'
import TuneIcon from '@mui/icons-material/Tune'
import ViewCarouselOutlinedIcon from '@mui/icons-material/ViewCarouselOutlined'
import {useTranslation} from 'react-i18next'
import {format} from 'date-fns'
import {Link, useNavigate} from '@tanstack/react-router'
import {getEvent, getStreamPickerMatches, getStreamSceneView, getStreamScenes} from '@api/sdk.gen.ts'
import {StreamPickerMatchDto, StreamSceneDto, StreamSceneViewDto} from '@api/types.gen.ts'
import {useFeedback, useFetch} from '@utils/hooks.ts'
import {useUser} from '@contexts/user/UserContext.ts'
import {updateEventGlobal, updateStreamGlobal} from '@authorization/privileges.ts'
import {useStreamSceneSocket} from '@components/event/stream/useStreamSceneSocket.ts'
import {matchOptionLabel} from '@components/event/stream/panel/streamPanelMatchOptions.ts'
import DirectorHeader from '@components/event/stream/director/DirectorHeader.tsx'
import DirectorGraphicCard, {
    DirectorMatchOption,
} from '@components/event/stream/director/DirectorGraphicCard.tsx'
import DirectorTrialPanel from '@components/event/stream/director/DirectorTrialPanel.tsx'
import StreamPreview from '@components/event/stream/director/StreamPreview.tsx'
import {DIRECTOR_COLORS, directorTheme} from '@components/event/stream/director/directorTheme.ts'
import {sceneViewErrorKey} from '@components/event/stream/director/directorErrors.ts'
import {graphicFeed} from '@components/event/stream/director/graphicFeed.ts'
import {useTrialControls} from '@components/event/stream/director/useTrialControls.ts'
import {newerSceneView} from '@components/event/stream/streamScenePush.ts'
import StreamGraphicConfigDialog from '@components/event/stream/StreamGraphicConfigDialog.tsx'
import StreamSceneShareDialog from '@components/event/stream/StreamSceneShareDialog.tsx'
import {STREAM_GRAPHIC_TYPES} from '@components/event/stream/streamGraphicCatalog.ts'
import {STREAM_PRELOAD_FONT_FACES} from '@components/event/stream/graphics/design/streamTheme.ts'
import {useDocumentTitle} from '@utils/useDocumentTitle.ts'

type Props = {eventId: string}

/**
 * Sicherheitstakt für die Lauf-Liste, ZUSÄTZLICH zum sofortigen Nachladen bei Kanal-Reconnect
 * — eine Regatta läuft über Stunden, ein einmaliger Abruf würde mit jedem beendeten Lauf
 * veralten. 60 s ist grobkörnig genug (kein Live-Wert, nur ein Wähler).
 */
const MATCHES_REFRESH_MS = 60_000
/** Grobkörniger Sekundentakt fürs Sendepause-Erkennen — kein Live-Rendering-Grund. */
const CLOCK_TICK_MS = 1_000

/**
 * Das Regie-Board des Livestreams — ein dunkler Vollbild-Arbeitsplatz wie Leitstand und
 * Sprecher-Board: Szenen als Reiter, links die Programmvorschau (was die Bühne JETZT sendet) und
 * der Probemodus, rechts je aktive Grafik eine Karte mit Live-Miniatur und Regie-Schaltern.
 *
 * Abonniert denselben Kanal wie die Bühne (`useStreamSceneSocket`): Das Board zeigt per
 * Konstruktion genau den Stand, den Wirecast gerade bekommt, nie einen eigenen Zwischenstand.
 */
const StreamDirectorPage = ({eventId}: Props) => {
    const {t} = useTranslation()
    useDocumentTitle(t('event.stream.director.title'))
    const baseTheme = useTheme()
    const theme = useMemo(() => directorTheme(baseTheme), [baseTheme])
    const navigate = useNavigate()
    const user = useUser()
    const canEdit =
        user.checkPrivilege(updateStreamGlobal) || user.checkPrivilege(updateEventGlobal)

    const {data: event} = useFetch(signal => getEvent({signal, path: {eventId}}), {deps: [eventId]})
    const [scenesReload, setScenesReload] = useState(0)
    const {data: scenes} = useFetch(signal => getStreamScenes({signal, path: {eventId}}), {
        deps: [eventId, scenesReload],
    })

    const [sceneId, setSceneId] = useState<string | null>(null)
    // Erste Szene vorwählen, sobald die Liste da ist — nur einmal: Ein Betrieb, der danach selbst
    // umschaltet, soll nicht zurückspringen, wenn die Liste aus anderem Grund neu lädt.
    useEffect(() => {
        if (sceneId === null && scenes && scenes.length > 0) setSceneId(scenes[0].id)
    }, [scenes, sceneId])
    const scene = scenes?.find(s => s.id === sceneId) ?? null

    const [fullscreen, setFullscreen] = useState(false)
    useEffect(() => {
        const onChange = () => setFullscreen(document.fullscreenElement != null)
        document.addEventListener('fullscreenchange', onChange)
        return () => document.removeEventListener('fullscreenchange', onChange)
    }, [])
    const toggleFullscreen = () => {
        if (document.fullscreenElement) void document.exitFullscreen()
        else document.documentElement.requestFullscreen().catch(() => {})
    }

    // Die Miniaturen zeigen die echten Grafiken — deren Schrift soll stehen, bevor die erste
    // Karte erscheint (dieselbe Vorladung wie die Bühne selbst).
    useEffect(() => {
        if (typeof document === 'undefined' || !('fonts' in document)) return
        for (const face of STREAM_PRELOAD_FONT_FACES) void document.fonts.load(face)
    }, [])

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <Box
                sx={{
                    position: 'fixed',
                    inset: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    backgroundColor: DIRECTOR_COLORS.background,
                    color: 'text.primary',
                }}>
                {scene && sceneId ? (
                    <DirectorScene
                        key={sceneId}
                        eventId={eventId}
                        scene={scene}
                        scenes={scenes ?? []}
                        eventName={event?.name ?? null}
                        canEdit={canEdit}
                        fullscreen={fullscreen}
                        onToggleFullscreen={toggleFullscreen}
                        onSelectScene={setSceneId}
                        onScenesChanged={() => setScenesReload(n => n + 1)}
                        onBack={() =>
                            void navigate({
                                to: '/event/$eventId',
                                params: {eventId},
                                search: {tab: 'betrieb'},
                            })
                        }
                    />
                ) : (
                    <>
                        <DirectorHeader
                            eventName={event?.name ?? null}
                            scenes={scenes ?? []}
                            sceneId={null}
                            onSelectScene={setSceneId}
                            health={null}
                            fullscreen={fullscreen}
                            onToggleFullscreen={toggleFullscreen}
                            onBack={() =>
                                void navigate({
                                    to: '/event/$eventId',
                                    params: {eventId},
                                    search: {tab: 'betrieb'},
                                })
                            }
                        />
                        {scenes && scenes.length === 0 && (
                            <Stack alignItems="center" spacing={2} sx={{p: 6}}>
                                <Typography color="text.secondary">
                                    {t('event.stream.scenes.none')}
                                </Typography>
                                <Link to="/event/$eventId/streamScenes" params={{eventId}}>
                                    <Button
                                        variant="outlined"
                                        startIcon={<ViewCarouselOutlinedIcon />}>
                                        {t('event.stream.director.manageScenes')}
                                    </Button>
                                </Link>
                            </Stack>
                        )}
                    </>
                )}
            </Box>
        </ThemeProvider>
    )
}

type SceneProps = {
    eventId: string
    scene: StreamSceneDto
    scenes: StreamSceneDto[]
    eventName: string | null
    canEdit: boolean
    fullscreen: boolean
    onToggleFullscreen: () => void
    onSelectScene: (sceneId: string) => void
    onScenesChanged: () => void
    onBack: () => void
}

/**
 * Der Board-Inhalt EINER Szene — mit `key={sceneId}` von außen gemountet, damit ein Szenenwechsel
 * seinen ganzen Zustand (gepushter Stand, Kanal, Zeitpunkt des letzten Rahmens) sauber neu
 * aufbaut, statt ihn manuell zurückzusetzen.
 */
const DirectorScene = ({
    eventId,
    scene,
    scenes,
    eventName,
    canEdit,
    fullscreen,
    onToggleFullscreen,
    onSelectScene,
    onScenesChanged,
    onBack,
}: SceneProps) => {
    const {t} = useTranslation()
    const feedback = useFeedback()
    const sceneId = scene.id

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
            if (view.sceneId === sceneId) setPushed(view)
        },
        [sceneId],
    )
    // onFrame statt onView für die Veraltet-Erkennung: ein Herzschlag trägt keinen Stand, zählt
    // aber als „der Kanal lebt" — sonst hielte eine ruhige, gesunde Szene die Warnung für echt.
    const onFrame = useCallback(() => setLastReceivedAt(Date.now()), [])
    const {connected} = useStreamSceneSocket(eventId, sceneId, onView, onFrame)

    // Der Kanal schickt den vollen Stand als ersten Rahmen — er überholt den Erstabruf von selbst.
    // Nach Serverzeit zusammengeführt, damit ein Nachladen (siehe `useTrialControls`) einen
    // Push überholen kann, der bei stehendem Kanal nie mehr käme.
    const view = newerSceneView(pushed, initial.data)

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

    // Läufe des Tages für den Lauf-Wähler — die Panel-eigene Quelle inklusive beendeter Läufe
    // („Ergebnis von Lauf 12 erneut zeigen" ist der Leitfall). Sicherheitstakt plus Nachschlag
    // bei jedem Kanal-Reconnect.
    const matchesData = useFetch(signal => getStreamPickerMatches({signal, path: {eventId}}), {
        deps: [eventId],
        preCondition: () => canEdit,
        autoReloadInterval: MATCHES_REFRESH_MS,
    })
    const matchOptions: DirectorMatchOption[] = useMemo(() => {
        const matches: StreamPickerMatchDto[] = matchesData.data ?? []
        return matches.map(m => ({
            id: m.matchId,
            label: matchOptionLabel(
                m,
                m.startTime ? format(new Date(m.startTime), t('format.time')) : null,
            ),
        }))
    }, [matchesData.data, t])
    const reloadMatchesRef = useRef(matchesData.reload)
    useEffect(() => {
        reloadMatchesRef.current = matchesData.reload
    })
    const wasConnectedRef = useRef(connected)
    useEffect(() => {
        if (connected && !wasConnectedRef.current) reloadMatchesRef.current()
        wasConnectedRef.current = connected
    }, [connected])

    const {
        busy: trialBusy,
        toggleTrialMode,
        setTrialPhase,
    } = useTrialControls({
        eventId,
        sceneId,
        onChanged: change => {
            // Den Szenenstand nachladen statt nur auf den Push zu warten (Begründung im Hook).
            initial.reload()
            if (change === 'trialMode') onScenesChanged()
        },
        onError: change =>
            feedback.error(
                change === 'trialMode' ? t('event.stream.scenes.trialMode.error') : t('common.error.unexpected'),
            ),
    })

    const [configOpen, setConfigOpen] = useState(false)
    const [shareOpen, setShareOpen] = useState(false)

    const inactiveTypes = STREAM_GRAPHIC_TYPES.filter(
        type => !scene.graphics.some(graphic => graphic.type === type && graphic.enabled),
    )
    const onAir = view?.graphics.filter(graphic => graphicFeed(graphic).status === 'onAir') ?? []

    return (
        <>
            <DirectorHeader
                eventName={eventName}
                scenes={scenes}
                sceneId={sceneId}
                onSelectScene={onSelectScene}
                health={{
                    connected,
                    lastReceivedAt,
                    now,
                    trialMode: view?.trialMode ?? scene.trialMode,
                }}
                fullscreen={fullscreen}
                onToggleFullscreen={onToggleFullscreen}
                onBack={onBack}
            />

            <Box
                sx={{
                    flex: 1,
                    minHeight: 0,
                    display: 'grid',
                    gridTemplateColumns: {xs: '1fr', md: 'minmax(360px, 2fr) 3fr'},
                    gap: 1.5,
                    p: 1.5,
                    overflow: {xs: 'auto', md: 'hidden'},
                }}>
                {/* Linke Spalte: Programm bleibt oben stehen, darunter scrollen Probemodus und Szene —
                    die Regie soll beim Durchklicken der Phasen immer sehen, was gerade gesendet wird. */}
                <Stack spacing={1.5} sx={{minHeight: 0}}>
                    <Section
                        title={t('event.stream.director.program')}
                        hint={t('event.stream.director.programHint')}>
                        {view ? (
                            <>
                                <StreamPreview view={view} clockOffsetMs={clockOffsetMs} />
                                <Stack
                                    direction="row"
                                    spacing={0.75}
                                    flexWrap="wrap"
                                    useFlexGap
                                    sx={{mt: 1}}>
                                    {onAir.length === 0 ? (
                                        <Typography variant="caption" color="text.secondary">
                                            {t('event.stream.director.nothingOnAir')}
                                        </Typography>
                                    ) : (
                                        onAir.map(graphic => (
                                            <Typography
                                                key={graphic.type}
                                                variant="caption"
                                                sx={{
                                                    px: 0.75,
                                                    py: 0.25,
                                                    borderRadius: 0.5,
                                                    fontWeight: 700,
                                                    backgroundColor: 'rgba(229, 57, 53, 0.18)',
                                                    color: DIRECTOR_COLORS.onAir,
                                                }}>
                                                {t(`event.stream.scenes.type.${graphic.type}`)}
                                            </Typography>
                                        ))
                                    )}
                                </Stack>
                            </>
                        ) : initial.error ? (
                            // Ein gescheiterter Erstabruf darf nicht wie ein ewiges „Verbinde …"
                            // aussehen — eine gelöschte Szene heilt kein Warten.
                            <Typography variant="caption" color="error.main">
                                {t(sceneViewErrorKey(initial.error))}
                            </Typography>
                        ) : (
                            <Typography variant="caption" color="text.secondary">
                                {t('event.stream.director.health.connecting')}
                            </Typography>
                        )}
                    </Section>

                    <Stack
                        spacing={1.5}
                        sx={{minHeight: 0, overflowY: {md: 'auto'}, pr: {md: 0.5}}}>
                        <Section>
                            <DirectorTrialPanel
                                trialMode={view?.trialMode ?? scene.trialMode}
                                trialPhase={view?.trialPhase ?? scene.trialPhase}
                                canEdit={canEdit}
                                busy={trialBusy}
                                onToggle={on => void toggleTrialMode(on)}
                                onPhase={phase => void setTrialPhase(phase)}
                            />
                        </Section>

                        <Section title={t('event.stream.director.scene')}>
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                {canEdit && (
                                    <Button
                                        size="small"
                                        variant="outlined"
                                        startIcon={<TuneIcon />}
                                        onClick={() => setConfigOpen(true)}>
                                        {t('event.stream.scenes.configureGraphics')}
                                    </Button>
                                )}
                                {canEdit && (
                                    <Button
                                        size="small"
                                        variant="outlined"
                                        startIcon={<LinkIcon />}
                                        onClick={() => setShareOpen(true)}>
                                        {t('event.stream.director.shareLink')}
                                    </Button>
                                )}
                                <Link to="/event/$eventId/streamScenes" params={{eventId}}>
                                    <Button
                                        size="small"
                                        variant="text"
                                        startIcon={<ViewCarouselOutlinedIcon />}>
                                        {t('event.stream.director.manageScenes')}
                                    </Button>
                                </Link>
                            </Stack>
                        </Section>
                    </Stack>
                </Stack>

                {/* Rechte Spalte: Grafiken */}
                <Stack spacing={1.5} sx={{minHeight: 0, overflowY: {md: 'auto'}, pr: {md: 0.5}}}>
                    {view && view.graphics.length === 0 && (
                        <Typography color="text.secondary" sx={{p: 2}}>
                            {t('event.stream.panel.noGraphics')}
                        </Typography>
                    )}
                    {view && view.graphics.length > 0 && (
                        <Box
                            sx={{
                                display: 'grid',
                                gap: 1.5,
                                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                            }}>
                            {view.graphics.map(graphic => (
                                <DirectorGraphicCard
                                    key={graphic.type}
                                    eventId={eventId}
                                    view={view}
                                    graphic={graphic}
                                    matchOptions={matchOptions}
                                    clockOffsetMs={clockOffsetMs}
                                    canEdit={canEdit}
                                />
                            ))}
                        </Box>
                    )}
                    {inactiveTypes.length > 0 && (
                        <Section
                            title={t('event.stream.director.inactive')}
                            hint={t('event.stream.director.inactiveHint')}>
                            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                                {inactiveTypes.map(type => (
                                    <Typography
                                        key={type}
                                        variant="caption"
                                        sx={{
                                            px: 1,
                                            py: 0.5,
                                            borderRadius: 0.5,
                                            border: `1px dashed ${DIRECTOR_COLORS.border}`,
                                            color: 'text.secondary',
                                        }}>
                                        {t(`event.stream.scenes.type.${type}`)}
                                    </Typography>
                                ))}
                            </Stack>
                        </Section>
                    )}
                </Stack>
            </Box>

            {canEdit && (
                <StreamGraphicConfigDialog
                    open={configOpen}
                    onClose={() => setConfigOpen(false)}
                    eventId={eventId}
                    scene={scene}
                    onSaved={onScenesChanged}
                />
            )}
            {canEdit && (
                <StreamSceneShareDialog
                    open={shareOpen}
                    onClose={() => setShareOpen(false)}
                    eventId={eventId}
                    scene={scene}
                />
            )}
        </>
    )
}

const Section = ({
    title,
    hint,
    children,
}: {
    title?: string
    hint?: string
    children: React.ReactNode
}) => (
    <Box
        sx={{
            p: 1.5,
            borderRadius: 1.5,
            border: `1px solid ${DIRECTOR_COLORS.border}`,
            backgroundColor: DIRECTOR_COLORS.paper,
        }}>
        {title && (
            <Stack direction="row" alignItems="baseline" spacing={1} sx={{mb: 1}}>
                <Typography variant="subtitle2" sx={{fontWeight: 700}}>
                    {title}
                </Typography>
                {hint && (
                    <Typography variant="caption" color="text.secondary">
                        {hint}
                    </Typography>
                )}
            </Stack>
        )}
        {children}
    </Box>
)

export default StreamDirectorPage
