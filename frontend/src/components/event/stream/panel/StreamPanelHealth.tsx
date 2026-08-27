import {Alert, FormControlLabel, Stack, Switch, Typography} from '@mui/material'
import ScienceIcon from '@mui/icons-material/Science'
import {useTranslation} from 'react-i18next'
import {isPanelStale, secondsSincePush} from './streamPanelHealth'

interface StreamPanelHealthProps {
    sceneName: string
    lastReceivedAt: number | null
    /** Sekundentakt der Seite — hier keine eigene Uhr, damit nur EIN Intervall pro Seite läuft. */
    now: number
    trialMode: boolean
    canEdit: boolean
    togglingTrialMode: boolean
    onToggleTrialMode: () => void
}

/**
 * Zustand des Kanals plus Testmodus-Hinweis — beides betrifft die ganze Szene, nicht eine
 * einzelne Grafikkarte, deshalb ein eigener Block über dem Kartenraster.
 *
 * Die Sendepause-Warnung nutzt bewusst eine EIGENE 30-Sekunden-Schwelle (`streamPanelHealth.ts`)
 * statt der 15-Sekunden-Schwelle der Bühne (`streamStale.ts`) — hier liest ein Mensch mit, ein
 * Fehlalarm bei jedem kurzen Ruckler wäre nur Lärm.
 */
const StreamPanelHealth = ({
    sceneName,
    lastReceivedAt,
    now,
    trialMode,
    canEdit,
    togglingTrialMode,
    onToggleTrialMode,
}: StreamPanelHealthProps) => {
    const {t} = useTranslation()
    const stale = isPanelStale(lastReceivedAt, now)
    const seconds = secondsSincePush(lastReceivedAt, now)

    return (
        <Stack spacing={1} sx={{mb: 2}}>
            {stale && seconds !== null && (
                <Alert severity="warning">
                    {t('event.stream.panel.health.stale', {name: sceneName, seconds})}
                </Alert>
            )}
            {trialMode && (
                <Alert severity="warning" icon={<ScienceIcon fontSize="inherit" />}>
                    {t('event.stream.panel.trialMode.activeWarning')}
                </Alert>
            )}
            {canEdit && (
                <FormControlLabel
                    control={
                        <Switch
                            checked={trialMode}
                            disabled={togglingTrialMode}
                            onChange={onToggleTrialMode}
                        />
                    }
                    label={
                        <Typography variant="body2">
                            {t('event.stream.scenes.trialMode.label')}
                        </Typography>
                    }
                />
            )}
        </Stack>
    )
}

export default StreamPanelHealth
