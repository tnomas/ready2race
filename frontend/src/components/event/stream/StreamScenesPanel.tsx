import {useState} from 'react'
import {
    Box,
    Button,
    Card,
    CardActions,
    CardContent,
    Chip,
    IconButton,
    Stack,
    Tooltip,
    Typography,
} from '@mui/material'
import {
    Add as AddIcon,
    ContentCopy as ContentCopyIcon,
    Delete as DeleteIcon,
    Edit as EditIcon,
    LiveTvOutlined as LiveTvOutlinedIcon,
    OpenInNew as OpenInNewIcon,
    QrCode2 as QrCode2Icon,
    Science as ScienceIcon,
    Tune as TuneIcon,
} from '@mui/icons-material'
import {useTranslation} from 'react-i18next'
import {useFeedback, useFetch} from '@utils/hooks'
import {useConfirmation} from '@contexts/confirmation/ConfirmationContext'
import {useUser} from '@contexts/user/UserContext.ts'
import {
    readEventGlobal,
    readStreamGlobal,
    updateEventGlobal,
    updateStreamGlobal,
} from '@authorization/privileges.ts'
import {Link} from '@tanstack/react-router'
import {deleteStreamScene, getStreamScenes, setStreamSceneTrialMode} from '@api/sdk.gen'
import {StreamSceneDto} from '@api/types.gen'
import {STREAM_GRAPHIC_TYPES} from './streamGraphicCatalog'
import StreamSceneDialog from './StreamSceneDialog'
import StreamGraphicConfigDialog from './StreamGraphicConfigDialog'
import StreamSceneShareDialog from './StreamSceneShareDialog'

interface StreamScenesPanelProps {
    eventId: string
}

/**
 * Die Verwaltung der Livestream-Szenen eines Events: Liste, Anlegen, Bearbeiten, Löschen,
 * Grafik-Konfiguration, Testmodus und der Geräte-Link für Wirecast/OBS. Struktur bewusst wie
 * `BoardsPanel` — dieselbe Verwaltungsaufgabe, nur für Szenen statt Boards.
 */
const StreamScenesPanel = ({eventId}: StreamScenesPanelProps) => {
    const {t} = useTranslation()
    const feedback = useFeedback()
    const {confirmAction} = useConfirmation()
    const user = useUser()

    // Lesen darf, wer diese Seite erreicht (READ STREAM oder READ EVENT); schreiben nur, wer
    // eines der beiden Änderungsrechte hat - ohne diese Prüfung stünden die Knöpfe auch für eine
    // reine Leserolle da und liefen beim Klick in den 403 des Servers (wie bei BoardsPanel).
    const canEdit =
        user.checkPrivilege(updateStreamGlobal) || user.checkPrivilege(updateEventGlobal)

    // Dieselbe Rechte-Alternative wie die Route selbst (`eventStreamPanelRoute`): sonst ist das
    // Kontroll-Panel von hier aus nirgends verlinkt.
    const canOpenPanel =
        user.checkPrivilege(readStreamGlobal) || user.checkPrivilege(readEventGlobal)

    const [reloadKey, setReloadKey] = useState(0)
    const [editingScene, setEditingScene] = useState<StreamSceneDto | null>(null)
    const [creatingScene, setCreatingScene] = useState(false)
    const [configuringScene, setConfiguringScene] = useState<StreamSceneDto | null>(null)
    const [sharingScene, setSharingScene] = useState<StreamSceneDto | null>(null)
    const [togglingTrialMode, setTogglingTrialMode] = useState<string | null>(null)

    const {data: scenes} = useFetch(signal => getStreamScenes({signal, path: {eventId}}), {
        deps: [eventId, reloadKey],
    })

    // Die nackte Adresse der Bühne OHNE Token: trägt nur, wo eine Sitzung mit READ STREAM/READ
    // EVENT im Browser liegt (also hier am Verwaltungsrechner). Für eine Wirecast-/OBS-Quelle
    // ohne Anmeldung führt der Weg über „Link teilen".
    const publicUrl = (scene: StreamSceneDto) => `${window.location.origin}/event/${eventId}/stream/${scene.id}`

    const enabledGraphicsCount = (scene: StreamSceneDto) => scene.graphics.filter(g => g.enabled).length

    const handleSceneSaved = (scene: StreamSceneDto) => {
        setReloadKey(prev => prev + 1)
        // Der Konfigurationsdialog braucht den aktuellen Stand, falls er direkt danach geöffnet
        // wird (z. B. neu angelegte Szene → sofort Grafiken einrichten).
        if (configuringScene?.id === scene.id) setConfiguringScene(scene)
    }

    const handleDelete = (scene: StreamSceneDto) => {
        confirmAction(
            async () => {
                const {error} = await deleteStreamScene({path: {eventId, sceneId: scene.id}})
                if (error) {
                    feedback.error(t('common.error.unexpected'))
                    return
                }
                feedback.success(t('event.stream.scenes.deleted'))
                setReloadKey(prev => prev + 1)
            },
            {
                title: t('common.confirmDelete'),
                content: t('event.stream.scenes.confirmDelete', {name: scene.name}),
                okText: t('common.delete'),
            },
        )
    }

    const handleToggleTrialMode = async (scene: StreamSceneDto) => {
        setTogglingTrialMode(scene.id)
        try {
            const {error} = await setStreamSceneTrialMode({
                path: {eventId, sceneId: scene.id},
                query: {trialMode: !scene.trialMode},
            })
            if (error) {
                feedback.error(t('event.stream.scenes.trialMode.error'))
                return
            }
            feedback.success(
                t(scene.trialMode ? 'event.stream.scenes.trialMode.off' : 'event.stream.scenes.trialMode.on'),
            )
            setReloadKey(prev => prev + 1)
        } finally {
            setTogglingTrialMode(null)
        }
    }

    return (
        <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{mb: 2}} flexWrap="wrap" gap={1}>
                <Typography variant="h5">{t('event.stream.scenes.title')}</Typography>
                <Stack direction="row" spacing={1}>
                    {canOpenPanel && (
                        <Link to={'/event/$eventId/streamPanel'} params={{eventId}}>
                            <Button variant="outlined" startIcon={<LiveTvOutlinedIcon />}>
                                {t('event.stream.panel.open')}
                            </Button>
                        </Link>
                    )}
                    {canEdit && (
                        <Button
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={() => setCreatingScene(true)}>
                            {t('event.stream.scenes.create')}
                        </Button>
                    )}
                </Stack>
            </Stack>

            {scenes && scenes.length === 0 && (
                <Typography color="text.secondary" sx={{py: 4, textAlign: 'center'}}>
                    {t('event.stream.scenes.none')}
                </Typography>
            )}

            <Box
                sx={{
                    display: 'grid',
                    gap: 2,
                    gridTemplateColumns: {xs: '1fr', md: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)'},
                }}>
                {scenes?.map(scene => (
                    <Card key={scene.id} variant="outlined">
                        <CardContent>
                            <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                                <Typography variant="h6">{scene.name}</Typography>
                                {scene.trialMode && (
                                    <Chip
                                        size="small"
                                        color="warning"
                                        icon={<ScienceIcon />}
                                        label={t('event.stream.scenes.trialMode.active')}
                                    />
                                )}
                            </Stack>
                            <Stack direction="row" spacing={1} sx={{mt: 1}} flexWrap="wrap">
                                <Chip
                                    size="small"
                                    label={t(`event.stream.scenes.background.${scene.background}`)}
                                    {...(scene.background === 'CHROMA' && scene.chromaColor
                                        ? {
                                              sx: {
                                                  bgcolor: scene.chromaColor,
                                                  color: 'common.white',
                                              },
                                          }
                                        : {})}
                                />
                                <Chip
                                    size="small"
                                    variant="outlined"
                                    label={t('event.stream.scenes.graphicsCount', {
                                        enabled: enabledGraphicsCount(scene),
                                        total: STREAM_GRAPHIC_TYPES.length,
                                    })}
                                />
                            </Stack>
                        </CardContent>
                        <CardActions>
                            <Tooltip title={t('event.stream.scenes.open')}>
                                <IconButton
                                    size="small"
                                    component="a"
                                    href={publicUrl(scene)}
                                    target="_blank"
                                    rel="noopener">
                                    <OpenInNewIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                            <Tooltip title={t('event.stream.scenes.copyUrl')}>
                                <IconButton
                                    size="small"
                                    onClick={() => {
                                        void navigator.clipboard.writeText(publicUrl(scene))
                                        feedback.success(t('event.stream.scenes.urlCopied'))
                                    }}>
                                    <ContentCopyIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                            {canEdit && (
                                <>
                                    <Tooltip title={t('event.stream.scenes.share.action')}>
                                        <IconButton size="small" onClick={() => setSharingScene(scene)}>
                                            <QrCode2Icon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title={t('event.stream.scenes.configureGraphics')}>
                                        <IconButton size="small" onClick={() => setConfiguringScene(scene)}>
                                            <TuneIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title={t('event.stream.scenes.trialMode.label')}>
                                        <IconButton
                                            size="small"
                                            color={scene.trialMode ? 'warning' : 'default'}
                                            disabled={togglingTrialMode === scene.id}
                                            onClick={() => void handleToggleTrialMode(scene)}>
                                            <ScienceIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                </>
                            )}
                            <Box sx={{flex: 1}} />
                            {canEdit && (
                                <>
                                    <IconButton size="small" onClick={() => setEditingScene(scene)}>
                                        <EditIcon fontSize="small" />
                                    </IconButton>
                                    <IconButton size="small" onClick={() => handleDelete(scene)}>
                                        <DeleteIcon fontSize="small" />
                                    </IconButton>
                                </>
                            )}
                        </CardActions>
                    </Card>
                ))}
            </Box>

            <StreamSceneDialog
                open={creatingScene}
                onClose={() => setCreatingScene(false)}
                eventId={eventId}
                scene={null}
                onSaved={handleSceneSaved}
            />

            {editingScene !== null && (
                <StreamSceneDialog
                    open
                    onClose={() => setEditingScene(null)}
                    eventId={eventId}
                    scene={editingScene}
                    onSaved={handleSceneSaved}
                />
            )}

            {configuringScene !== null && (
                <StreamGraphicConfigDialog
                    open
                    onClose={() => setConfiguringScene(null)}
                    eventId={eventId}
                    scene={configuringScene}
                    onSaved={handleSceneSaved}
                />
            )}

            {sharingScene !== null && (
                <StreamSceneShareDialog
                    open
                    onClose={() => setSharingScene(null)}
                    eventId={eventId}
                    scene={sharingScene}
                />
            )}
        </Box>
    )
}

export default StreamScenesPanel
