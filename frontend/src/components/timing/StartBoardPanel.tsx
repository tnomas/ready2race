import {
    Alert,
    ButtonBase,
    CircularProgress,
    IconButton,
    Stack,
    Typography,
} from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import {MouseEvent, useCallback, useMemo} from 'react'
import {useTranslation} from 'react-i18next'
import {TimingMatchDto, TimingTeamDto} from '@api/types.gen.ts'
import {useFeedback} from '@utils/hooks.ts'
import {UseSequenceResult} from '@utils/timing/useSequence.ts'
import {sequenceRequestFromMode} from '@utils/timing/matchBoard.ts'
import {tonePlanForSequence} from '@utils/timing/tonePlan.ts'
import {teamLabel} from '@utils/timing/teamLabel.ts'
import {ModeChip, ProgressChip, matchTitle} from '@components/timing/matchDisplay.tsx'
import SequenceStatusBar from '@components/timing/SequenceStatusBar.tsx'
import {touchTargetSx} from '@utils/touch.ts'

export type StartBoardPanelProps = {
    stationId: string
    matches: TimingMatchDto[]
    matchesLoading: boolean
    matchesError: boolean
    /** Alle Teams der Veranstaltung — nur für die Beschriftung der Sequenz-Leiste. */
    teams: TimingTeamDto[]
    now: () => number | null
    sequenceState: UseSequenceResult
    /** Die fokussierte Partie (aufgelöst von der Seite, vorgerückt nach jedem Start). */
    focusedMatch: TimingMatchDto | undefined
    /** Öffnet das Aktionsmenü der Partie (Sequenz abbrechen, Start zurücknehmen). */
    onOpenMenu: (match: TimingMatchDto, anchor: HTMLElement) => void
    /** Ob das Menü für die fokussierte Partie etwas anzubieten hat. */
    menuAvailable: (match: TimingMatchDto) => boolean
    onPause: () => void
    onResume: () => void
    onRewind: () => void
    onAbort: () => void
    onSkip: (entryId: string, teamLabel: string) => void
}

/**
 * Die Arbeitsfläche des Startpostens: EIN Startknopf — die große Fläche trägt die Beschriftung
 * der fokussierten Partie („Start: 09:20 · Finale CF2x") und erzeugt aus deren aufgelöstem
 * Zeitnahmetyp die Sequenz samt Countdown-Start; einen separaten Zweitknopf gibt es nicht mehr.
 * Der Sequenzfortschritt erscheint als schmale Leiste über dem Knopf (kein Overlay), Abbruch und
 * Neustart je Lauf hängen am Menü der Partie. Sequenz-Parameter leben ausschließlich am
 * Zeitnahmetyp in den Einstellungen — das frühere Formular „Sequenz von Hand einrichten" ist
 * bewusst weg.
 */
const StartBoardPanel = ({
    stationId,
    matches,
    matchesLoading,
    matchesError,
    teams,
    now,
    sequenceState,
    focusedMatch,
    onOpenMenu,
    menuAvailable,
    onPause,
    onResume,
    onRewind,
    onAbort,
    onSkip,
}: StartBoardPanelProps) => {
    const {t} = useTranslation()
    const feedback = useFeedback()
    const {sequence, busy, createAndStart, start, reset} = sequenceState

    const teamsById = useMemo(() => {
        const map = new Map<string, TimingTeamDto>()
        teams.forEach(team => map.set(team.competitionMatchTeam, team))
        return map
    }, [teams])
    const label = useCallback((id: string) => teamLabel(teamsById.get(id), id), [teamsById])

    const handleStart = useCallback(() => {
        if (focusedMatch === undefined || focusedMatch.timingMode == null) return
        // Zweite Sperrstelle neben dem gesperrten Knopf: Dies ist der EINZIGE Weg, eine Sequenz zu
        // erzeugen — er soll die Regel selbst tragen und nicht darauf bauen, dass oben jemand das
        // `disabled` richtig gesetzt hat.
        if (!focusedMatch.timingMode.startSequenceEnabled) return
        void createAndStart(
            sequenceRequestFromMode(stationId, focusedMatch.timingMode, focusedMatch.teams),
        ).then(ok => {
            if (!ok) feedback.error(t('timing.matches.error.start'))
        })
    }, [focusedMatch, createAndStart, stationId, feedback, t])

    const handleSequenceStart = useCallback(() => {
        void start().then(ok => {
            if (!ok) feedback.error(t('timing.sequence.error.start'))
        })
    }, [start, feedback, t])

    if (matchesLoading && matches.length === 0) {
        return (
            <Stack alignItems="center" justifyContent="center" sx={{flexGrow: 1}}>
                <CircularProgress />
            </Stack>
        )
    }

    const startableTeams = focusedMatch?.teams.filter(team => !team.started).length ?? 0
    // PAUSED zählt mit: die Sequenz ist nur angehalten, nicht beendet — sie belegt ihren Posten
    // weiter, also darf der große Startknopf auch währenddessen keine zweite Partie loslassen.
    const sequenceLive =
        sequence !== undefined &&
        (sequence.state === 'ARMED' ||
            sequence.state === 'RUNNING' ||
            sequence.state === 'PAUSED')
    // Startet die App Läufe dieses Typs überhaupt? Nicht jeder Lauf bekommt eine Sequenz: Wird am
    // Steg von Hand losgeschickt, gibt es kein Countdown-Fenster — und ein Board, das trotzdem
    // eines anbietet, lädt zum falschen Griff ein. Der manuelle Stempel bleibt der Weg; er hängt
    // an `showManualCapture` und nicht an dieser Sperre.
    const sequenceOffByMode = focusedMatch?.timingMode?.startSequenceEnabled === false
    const startDisabled =
        busy ||
        sequenceLive ||
        focusedMatch === undefined ||
        focusedMatch.timingMode == null ||
        sequenceOffByMode ||
        startableTeams === 0

    return (
        <Stack sx={{flexGrow: 1, width: 1, minHeight: 0, minWidth: 0}} spacing={1.5}>
            {matchesError && <Alert severity="error">{t('timing.matches.loadError')}</Alert>}

            {focusedMatch !== undefined ? (
                <Stack spacing={0.75} sx={{flexShrink: 0}}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                        <Typography variant="h6" sx={{fontWeight: 700, minWidth: 0}}>
                            {matchTitle(focusedMatch)}
                        </Typography>
                        <ModeChip mode={focusedMatch.timingMode} />
                        <ProgressChip progress={focusedMatch.progress} />
                        {menuAvailable(focusedMatch) && (
                            <IconButton
                                size="small"
                                aria-label={t('timing.matches.menu.open')}
                                sx={touchTargetSx}
                                onClick={(event: MouseEvent<HTMLButtonElement>) =>
                                    onOpenMenu(focusedMatch, event.currentTarget)
                                }>
                                <MoreVertIcon fontSize="small" />
                            </IconButton>
                        )}
                    </Stack>
                    {/* Die Boote in Startreihenfolge — genau das, was der Griff gleich in die
                        Sequenz stellt (bereits gestartete werden weggelassen). */}
                    <Typography variant="caption" color="text.secondary">
                        {[...focusedMatch.teams]
                            .sort((a, b) => a.startNumber - b.startNumber)
                            .map(team =>
                                `#${team.startNumber} ${team.teamName ?? team.clubName ?? ''}`.trim(),
                            )
                            .join(' · ')}
                    </Typography>
                </Stack>
            ) : (
                matches.length > 0 && (
                    <Alert severity="success" sx={{flexShrink: 0}}>
                        {t('timing.matches.allStarted')}
                    </Alert>
                )
            )}

            {focusedMatch !== undefined && focusedMatch.timingMode == null && (
                <Alert severity="warning" sx={{flexShrink: 0}}>
                    {t('timing.matches.noModeHint')}
                </Alert>
            )}
            {/* Kein Mangel, sondern die Absicht des Zeitnahmetyps — deshalb ein Hinweis und keine
                Warnung. Er nennt den Typ beim Namen, damit klar ist, WO das eingestellt ist. */}
            {sequenceOffByMode && focusedMatch?.timingMode != null && (
                <Alert severity="info" sx={{flexShrink: 0}}>
                    {t('timing.matches.noStartSequenceHint', {
                        mode: focusedMatch.timingMode.name,
                    })}
                </Alert>
            )}
            {focusedMatch !== undefined &&
                focusedMatch.timingMode != null &&
                !sequenceOffByMode &&
                startableTeams === 0 && (
                    <Alert severity="warning" sx={{flexShrink: 0}}>
                        {t('timing.matches.noTeamsLeft')}
                    </Alert>
                )}

            {sequence !== undefined && (
                <SequenceStatusBar
                    sequence={sequence}
                    label={label}
                    now={now}
                    // Der Plan der Partie, zu der die SEQUENZ gehört — nicht der fokussierten:
                    // der Fokus rückt nach dem Start weiter, die Töne laufen aber noch für den
                    // gestarteten Lauf.
                    tonePlan={tonePlanForSequence(matches, sequence)}
                    busy={busy}
                    onStart={handleSequenceStart}
                    onPause={onPause}
                    onResume={onResume}
                    // Ohne gestarteten Eintrag hätte das Zurücksetzen nichts zurückzunehmen —
                    // der Server antwortete mit 409, also bietet die Leiste den Knopf erst gar
                    // nicht an.
                    onRewind={
                        sequence.entries.some(entry => entry.status === 'STARTED')
                            ? onRewind
                            : undefined
                    }
                    onAbort={onAbort}
                    onSkip={onSkip}
                    onDismiss={reset}
                />
            )}

            {/* Der EINE Startknopf: groß genug für den Daumen am Wasser, beschriftet mit der
                Partie, die er startet. Während einer laufenden Sequenz ist er gesperrt — erst
                abschließen (oder abbrechen), dann die nächste Partie. */}
            <ButtonBase
                onClick={handleStart}
                disabled={startDisabled}
                focusRipple
                data-sequence-panel=""
                sx={{
                    flexGrow: 1,
                    width: 1,
                    minHeight: 120,
                    borderRadius: 2,
                    bgcolor: startDisabled ? 'action.disabledBackground' : 'primary.main',
                    color: startDisabled ? 'text.disabled' : 'primary.contrastText',
                    transition: 'background-color 0.1s',
                    '&:active': startDisabled ? undefined : {bgcolor: 'primary.dark'},
                }}>
                <Stack alignItems="center" spacing={1} sx={{px: 2, minWidth: 0}}>
                    <PlayArrowIcon sx={{fontSize: {xs: 48, sm: 72}}} />
                    <Typography
                        variant="h5"
                        component="span"
                        textAlign="center"
                        sx={{wordBreak: 'break-word'}}>
                        {focusedMatch !== undefined
                            ? t('timing.matches.startFocused', {match: matchTitle(focusedMatch)})
                            : t('timing.matches.start')}
                    </Typography>
                </Stack>
            </ButtonBase>
        </Stack>
    )
}

export default StartBoardPanel
