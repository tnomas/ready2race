import {Box, Chip, IconButton, Stack, Tab, Tabs, Tooltip, Typography} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import FullscreenIcon from '@mui/icons-material/Fullscreen'
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit'
import ScienceIcon from '@mui/icons-material/Science'
import {useTranslation} from 'react-i18next'
import {StreamSceneDto} from '@api/types.gen'
import {isPanelStale, secondsSincePush} from '../panel/streamPanelHealth'
import {DIRECTOR_COLORS} from './directorTheme'

interface DirectorHeaderProps {
    eventName: string | null
    scenes: StreamSceneDto[]
    sceneId: string | null
    onSelectScene: (sceneId: string) => void
    /** Kanalzustand der gewählten Szene — null, solange keine Szene gewählt ist. */
    health: {connected: boolean; lastReceivedAt: number | null; now: number; trialMode: boolean} | null
    fullscreen: boolean
    onToggleFullscreen: () => void
    onBack: () => void
}

/**
 * Kopfzeile des Regie-Boards: Zurück, Titel, die Szenen als Reiter (eine Szene ist ein Shot in
 * Wirecast — die Regie springt zwischen ihnen wie zwischen Kameras), rechts der Kanalzustand
 * und der Vollbild-Schalter. Die Sendepause-Warnung nutzt die 30-s-Schwelle des Panels
 * (`streamPanelHealth.ts`), nicht die 45 s der Bühne — hier liest ein Mensch mit, der früher
 * hinsehen soll, als die Bühne von sich aus Einblendungen sperrt.
 */
const DirectorHeader = ({
    eventName,
    scenes,
    sceneId,
    onSelectScene,
    health,
    fullscreen,
    onToggleFullscreen,
    onBack,
}: DirectorHeaderProps) => {
    const {t} = useTranslation()
    const stale = health ? isPanelStale(health.lastReceivedAt, health.now) : false
    const seconds = health ? secondsSincePush(health.lastReceivedAt, health.now) : null

    const healthChip = (() => {
        if (!health) return null
        if (stale && seconds !== null) {
            return <Chip size="small" color="warning" label={t('event.stream.director.health.stale', {seconds})} />
        }
        if (!health.connected) {
            return <Chip size="small" color="default" label={t('event.stream.director.health.connecting')} />
        }
        return (
            <Chip
                size="small"
                label={t('event.stream.director.health.live')}
                sx={{backgroundColor: 'rgba(77, 159, 133, 0.18)', color: DIRECTOR_COLORS.ready, fontWeight: 700}}
            />
        )
    })()

    return (
        <Stack
            direction="row"
            alignItems="center"
            spacing={1.5}
            sx={{
                px: 1.5,
                py: 0.75,
                borderBottom: `1px solid ${DIRECTOR_COLORS.border}`,
                backgroundColor: DIRECTOR_COLORS.paper,
                flexShrink: 0,
            }}>
            <IconButton size="small" onClick={onBack} aria-label={t('event.stream.director.back')}>
                <ArrowBackIcon />
            </IconButton>
            <Box sx={{minWidth: 0}}>
                <Typography variant="subtitle1" sx={{fontWeight: 800, lineHeight: 1.1}}>
                    {t('event.stream.director.title')}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap sx={{display: 'block'}}>
                    {eventName ?? ''}
                </Typography>
            </Box>
            <Tabs
                value={sceneId ?? false}
                onChange={(_, value) => onSelectScene(value)}
                variant="scrollable"
                scrollButtons="auto"
                sx={{flex: 1, minHeight: 40, '& .MuiTab-root': {minHeight: 40, fontWeight: 700}}}>
                {scenes.map(scene => (
                    <Tab
                        key={scene.id}
                        value={scene.id}
                        label={scene.name}
                        icon={scene.trialMode ? <ScienceIcon sx={{fontSize: '1rem', color: DIRECTOR_COLORS.noFeed}} /> : undefined}
                        iconPosition="end"
                    />
                ))}
            </Tabs>
            {health?.trialMode && (
                <Chip
                    size="small"
                    icon={<ScienceIcon />}
                    label={t('event.stream.director.trial.chip')}
                    sx={{backgroundColor: 'rgba(245, 179, 66, 0.18)', color: DIRECTOR_COLORS.noFeed, fontWeight: 700}}
                />
            )}
            {healthChip}
            <Tooltip title={t('event.stream.director.fullscreen')}>
                <IconButton size="small" onClick={onToggleFullscreen}>
                    {fullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
                </IconButton>
            </Tooltip>
        </Stack>
    )
}

export default DirectorHeader
