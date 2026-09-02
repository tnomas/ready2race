import {Box, Stack, Typography} from '@mui/material'
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline'
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline'
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew'
import {useTranslation} from 'react-i18next'
import {LiveDashboardMatchDto} from '@api/types.gen.ts'
import SequenceCountdown from '@components/timing/SequenceCountdown.tsx'
import {formatCountdown} from '@utils/timing/sequenceDisplay.ts'
import {useServerClock} from '@utils/timing/useServerClock.ts'
import {sequenceProgress} from './liveDashboardSequence.ts'

type Props = {
    match: LiveDashboardMatchDto
}

/**
 * Der Streifen über der Bootstabelle: wo die Startsequenz des Laufs gerade steht. Nur für
 * scharfe, laufende und pausierte Sequenzen — der Server liefert nichts anderes, und alles
 * Erledigte erzählt die Tabelle selbst besser.
 *
 * Die Serveruhr lebt hier drin und nicht auf Seitenebene: sie tastet alle fünf Sekunden den
 * Server ab, und das soll nur laufen, solange auf irgendeiner Karte tatsächlich ein Countdown
 * steht — am Steg hängen viele Telefone an demselben Backend. Ein Streifen je Karte mit Sequenz,
 * im Normalfall also genau einer.
 *
 * Kein Ton: die Töne gehören dem Startbereich. Das Dashboard zählt stumm mit (`tonePlan={[]}`,
 * dieselbe Regel wie im Sprecher-Board).
 */
const LiveDashboardSequenceStrip = ({match}: Props) => {
    const {t} = useTranslation()
    const clock = useServerClock()
    const progress = sequenceProgress(match)
    if (!progress) return null

    const accent =
        progress.state === 'RUNNING'
            ? 'success.dark'
            : progress.state === 'PAUSED'
              ? 'warning.dark'
              : 'info.main'
    const Icon =
        progress.state === 'RUNNING'
            ? PlayCircleOutlineIcon
            : progress.state === 'PAUSED'
              ? PauseCircleOutlineIcon
              : PowerSettingsNewIcon
    const label =
        progress.state === 'RUNNING'
            ? t('event.liveDashboard.sequence.running')
            : progress.state === 'PAUSED'
              ? t('event.liveDashboard.sequence.paused')
              : t('event.liveDashboard.sequence.armed')
    const nextLabel =
        progress.next?.startNumber != null
            ? t('event.liveDashboard.sequence.nextStart', {number: progress.next.startNumber})
            : null

    return (
        <Box
            data-testid="live-dashboard-sequence-strip"
            sx={{
                mt: 0.75,
                px: 1,
                py: 0.5,
                borderRadius: 1,
                borderLeft: '4px solid',
                borderLeftColor: accent,
                bgcolor: 'grey.50',
            }}>
            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
                <Stack direction="row" spacing={0.5} alignItems="center" sx={{color: accent}}>
                    <Icon fontSize="small" />
                    <Typography variant="body2" fontWeight={700}>
                        {label}
                    </Typography>
                </Stack>
                <Typography variant="body2" sx={{color: 'grey.800'}}>
                    {t('event.liveDashboard.sequence.progress', {
                        started: progress.startedCount,
                        total: progress.total,
                    })}
                </Typography>
                {progress.state === 'RUNNING' && progress.targetMillis != null && (
                    <Stack direction="row" spacing={1} alignItems="baseline" sx={{ml: 'auto'}}>
                        {nextLabel && (
                            <Typography variant="body2" sx={{color: 'grey.700'}}>
                                {nextLabel}
                            </Typography>
                        )}
                        <SequenceCountdown
                            targetMillis={progress.targetMillis}
                            now={clock.now}
                            overdueLabel={t('event.liveDashboard.sequence.startNow')}
                            tonePlan={[]}
                            sx={{
                                fontSize: '1.25rem',
                                color: accent,
                                '&[data-overdue="true"]': {fontSize: '1.25rem'},
                            }}
                        />
                    </Stack>
                )}
                {progress.state === 'PAUSED' && progress.frozenRemainingMillis != null && (
                    <Stack direction="row" spacing={1} alignItems="baseline" sx={{ml: 'auto'}}>
                        {nextLabel && (
                            <Typography variant="body2" sx={{color: 'grey.700'}}>
                                {nextLabel}
                            </Typography>
                        )}
                        <Typography
                            component="span"
                            sx={{
                                fontFamily: 'monospace',
                                fontVariantNumeric: 'tabular-nums',
                                fontWeight: 700,
                                fontSize: '1.25rem',
                                color: accent,
                            }}>
                            {formatCountdown(progress.frozenRemainingMillis)}
                        </Typography>
                    </Stack>
                )}
            </Stack>
        </Box>
    )
}

export default LiveDashboardSequenceStrip
