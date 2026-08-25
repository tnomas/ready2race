import {Alert, Button, Paper, Stack, Typography} from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import CancelIcon from '@mui/icons-material/Cancel'
import SkipNextIcon from '@mui/icons-material/SkipNext'
import {useMemo} from 'react'
import {useTranslation} from 'react-i18next'
import {TimingSequenceDto} from '@api/types.gen.ts'
import {splitRunningEntries} from '@utils/timing/sequenceDisplay.ts'
import {ToneStep} from '@utils/timing/tonePlan.ts'
import SequenceCountdown from '@components/timing/SequenceCountdown.tsx'
import {touchTargetSx} from '@utils/touch.ts'

export type SequenceStatusBarProps = {
    sequence: TimingSequenceDto
    /** Team-Beschriftung je competitionMatchTeam-Id. */
    label: (id: string) => string
    now: () => number | null
    /** Tonplan des aufgelösten Zeitnahmetyps der Sequenz (siehe `tonePlanForSequence`). */
    tonePlan?: readonly ToneStep[]
    busy: boolean
    onStart: () => void
    onAbort: () => void
    onSkip: (entryId: string, teamLabel: string) => void
    /** Terminale Zusammenfassung (DONE/ABORTED) wegklicken. */
    onDismiss: () => void
}

/**
 * Der Sequenzfortschritt als schmale, additive Leiste unter der fokussierten Partie: wer ist
 * dran, kompakte Countdown-Ziffer, „n/m gestartet", Abbrechen. Bewusst KEIN vollflächiges
 * Overlay — die große Visualisierung (Vollbild-Countdown mit Beeps) bleibt der Anzeige-Route,
 * das Board behält währenddessen Tagesablauf, Startknopf und Zeitenliste im Blick.
 *
 * `data-sequence-panel` lässt die Leertaste eines fokussierten Knopfs hier den Knopf auslösen
 * statt still eine Zeitmarke zu banken (siehe `shortcutGuards`).
 */
const SequenceStatusBar = ({
    sequence,
    label,
    now,
    tonePlan,
    busy,
    onStart,
    onAbort,
    onSkip,
    onDismiss,
}: SequenceStatusBarProps) => {
    const {t} = useTranslation()
    const split = useMemo(() => splitRunningEntries(sequence), [sequence])

    if (sequence.state === 'DONE' || sequence.state === 'ABORTED') {
        return (
            <Alert
                data-sequence-panel=""
                severity={sequence.state === 'DONE' ? 'success' : 'warning'}
                sx={{flexShrink: 0}}
                action={
                    <Button color="inherit" size="small" onClick={onDismiss}>
                        {t('common.ok')}
                    </Button>
                }>
                {sequence.state === 'DONE'
                    ? t('timing.sequence.summary.titleDone')
                    : t('timing.sequence.summary.titleAborted')}
            </Alert>
        )
    }

    const startedCount = sequence.entries.filter(entry => entry.status === 'STARTED').length
    const total = sequence.entries.length

    return (
        <Paper
            data-sequence-panel=""
            variant="outlined"
            sx={{flexShrink: 0, px: 1.5, py: 0.75}}>
            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
                {sequence.state === 'ARMED' ? (
                    <>
                        <Typography variant="body2" sx={{fontWeight: 600}}>
                            {t('timing.sequence.armed.title')}
                        </Typography>
                        <Button
                            size="small"
                            variant="contained"
                            startIcon={<PlayArrowIcon />}
                            disabled={busy}
                            sx={touchTargetSx}
                            onClick={onStart}>
                            {t('timing.sequence.armed.start')}
                        </Button>
                    </>
                ) : (
                    <>
                        {split.next !== undefined && split.targetMillis !== undefined && (
                            <SequenceCountdown
                                targetMillis={split.targetMillis}
                                now={now}
                                tonePlan={tonePlan}
                                overdueLabel={t('timing.sequence.running.overdue')}
                                // Kompakte Ziffer statt Vollbild — die große Fassung gehört der
                                // Anzeige-Route.
                                sx={{
                                    fontSize: '1.75rem',
                                    lineHeight: 1.2,
                                    '&[data-overdue="true"]': {fontSize: '1.25rem'},
                                }}
                            />
                        )}
                        <Typography variant="body1" noWrap sx={{fontWeight: 600, minWidth: 0}}>
                            {split.next !== undefined
                                ? label(split.next.competitionMatchTeam)
                                : t('timing.sequence.running.finishing')}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{flexShrink: 0}}>
                            {t('timing.sequence.bar.started', {
                                started: startedCount,
                                total,
                            })}
                        </Typography>
                        {split.next !== undefined && (
                            <Button
                                size="small"
                                startIcon={<SkipNextIcon />}
                                disabled={busy}
                                sx={touchTargetSx}
                                onClick={() =>
                                    onSkip(
                                        split.next!.id,
                                        label(split.next!.competitionMatchTeam),
                                    )
                                }>
                                {t('timing.sequence.entry.skip')}
                            </Button>
                        )}
                    </>
                )}
                <Stack sx={{flexGrow: 1}} />
                <Button
                    size="small"
                    color="error"
                    startIcon={<CancelIcon />}
                    disabled={busy}
                    sx={touchTargetSx}
                    onClick={onAbort}>
                    {t('timing.sequence.abort')}
                </Button>
            </Stack>
        </Paper>
    )
}

export default SequenceStatusBar
