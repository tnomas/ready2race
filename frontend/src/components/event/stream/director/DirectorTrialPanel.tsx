import {Box, ButtonBase, Stack, Switch, Typography} from '@mui/material'
import ReplayIcon from '@mui/icons-material/Replay'
import ScienceIcon from '@mui/icons-material/Science'
import {useTranslation} from 'react-i18next'
import {StreamTrialPhase} from '@api/types.gen'
import {DIRECTOR_COLORS} from './directorTheme'

/** Die Phasen in der Reihenfolge eines Laufs — dieselbe wie die Aufzählung der API. */
export const STREAM_TRIAL_PHASES: StreamTrialPhase[] = [
    'PREPARING',
    'COUNTDOWN',
    'RUNNING',
    'SPLIT',
    'FINISH',
    'FINISHED',
    'RESULT',
    'IDLE',
]

interface DirectorTrialPanelProps {
    trialMode: boolean
    /** Gewählte Phase — vom Szenenstand, nur belegt solange der Probemodus an ist. */
    trialPhase: StreamTrialPhase | null | undefined
    canEdit: boolean
    busy: boolean
    onToggle: (on: boolean) => void
    onPhase: (phase: StreamTrialPhase) => void
}

/**
 * Der Probemodus als Klickliste: Schalter oben, darunter die acht Phasen eines Laufs. Ein Klick
 * setzt die Phase (der Server pusht sofort), ein Klick auf die aktive Phase löst ihre
 * Einblendfenster erneut aus — so lässt sich jede Grafik gezielt ansehen, statt auf eine
 * Schleife zu warten.
 */
const DirectorTrialPanel = ({trialMode, trialPhase, canEdit, busy, onToggle, onPhase}: DirectorTrialPanelProps) => {
    const {t} = useTranslation()

    return (
        <Stack spacing={1}>
            <Stack direction="row" alignItems="center" spacing={1}>
                <ScienceIcon fontSize="small" sx={{color: trialMode ? DIRECTOR_COLORS.noFeed : 'text.secondary'}} />
                <Typography variant="subtitle2" sx={{fontWeight: 700, flex: 1}}>
                    {t('event.stream.director.trial.title')}
                </Typography>
                <Switch
                    size="small"
                    checked={trialMode}
                    disabled={!canEdit || busy}
                    onChange={(_, checked) => onToggle(checked)}
                    inputProps={{'aria-label': t('event.stream.director.trial.title')}}
                />
            </Stack>
            <Typography variant="caption" sx={{color: trialMode ? DIRECTOR_COLORS.noFeed : 'text.secondary'}}>
                {trialMode ? t('event.stream.director.trial.on') : t('event.stream.director.trial.off')}
            </Typography>

            <Stack spacing={0.5} sx={{opacity: trialMode ? 1 : 0.45}}>
                {STREAM_TRIAL_PHASES.map((phase, index) => {
                    const active = trialMode && trialPhase === phase
                    return (
                        <ButtonBase
                            key={phase}
                            disabled={!canEdit || !trialMode || busy}
                            onClick={() => onPhase(phase)}
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1.25,
                                width: '100%',
                                textAlign: 'left',
                                px: 1.25,
                                py: 0.75,
                                borderRadius: 1,
                                border: `1px solid ${active ? DIRECTOR_COLORS.noFeed : DIRECTOR_COLORS.border}`,
                                backgroundColor: active ? 'rgba(245, 179, 66, 0.12)' : DIRECTOR_COLORS.raised,
                                '&:hover': {backgroundColor: active ? 'rgba(245, 179, 66, 0.2)' : 'rgba(255,255,255,0.06)'},
                            }}>
                            <Box
                                sx={{
                                    width: '1.5rem',
                                    height: '1.5rem',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    backgroundColor: active ? DIRECTOR_COLORS.noFeed : 'rgba(255,255,255,0.1)',
                                    color: active ? '#1a1207' : 'text.secondary',
                                }}>
                                {index + 1}
                            </Box>
                            <Box sx={{flex: 1, minWidth: 0}}>
                                <Typography variant="body2" sx={{fontWeight: 700, lineHeight: 1.2}}>
                                    {t(`event.stream.director.trial.phase.${phase}.label`)}
                                </Typography>
                                <Typography variant="caption" sx={{color: 'text.secondary', lineHeight: 1.2, display: 'block'}}>
                                    {t(`event.stream.director.trial.phase.${phase}.hint`)}
                                </Typography>
                            </Box>
                            {active && (
                                <ReplayIcon
                                    fontSize="small"
                                    titleAccess={t('event.stream.director.trial.retrigger')}
                                    sx={{color: DIRECTOR_COLORS.noFeed}}
                                />
                            )}
                        </ButtonBase>
                    )
                })}
            </Stack>
            {trialMode && (
                <Typography variant="caption" color="text.secondary">
                    {t('event.stream.director.trial.retriggerHint')}
                </Typography>
            )}
        </Stack>
    )
}

export default DirectorTrialPanel
