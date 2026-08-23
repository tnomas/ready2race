import {Alert, Box, Button, ButtonBase, CircularProgress, Stack, Typography} from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import {useCallback, useState} from 'react'
import {useTranslation} from 'react-i18next'
import {TimingMatchDto} from '@api/types.gen.ts'
import {useFeedback} from '@utils/hooks.ts'
import {BoardMark} from '@components/timing/useTimingBoardState.ts'
import {assignCapturedMark, CaptureFn} from '@components/timing/useCaptureFlow.ts'
import {expectedFinishMatches, pendingAssignmentMark} from '@utils/timing/matchBoard.ts'
import {ModeChip, ProgressChip, matchTitle} from '@components/timing/matchDisplay.tsx'

/** Uhrzeit einer Marke mit Zehntel — dieselbe Präzision wie in der Markenliste darunter. */
function formatMarkTime(ms: number): string {
    const date = new Date(ms)
    const hh = String(date.getHours()).padStart(2, '0')
    const mm = String(date.getMinutes()).padStart(2, '0')
    const ss = String(date.getSeconds()).padStart(2, '0')
    const tenths = Math.floor(date.getMilliseconds() / 100)
    return `${hh}:${mm}:${ss}.${tenths}`
}

export type MatchCaptureViewProps = {
    eventId: string
    matches: TimingMatchDto[]
    matchesLoading: boolean
    /** Die Marken DIESES Postens (vom Board bereits gefiltert), inkl. optimistischer Einträge. */
    marks: BoardMark[]
    /** Teams mit zugeordneter ACTIVE-Marke an diesem Posten — hier fertig, Knopf gesperrt. */
    finishedTeams: Set<string>
    capture: CaptureFn
    disabled: boolean
    disabledReason?: string
    /** Optimistische Zuordnung des Boards — für das sofortige Abhaken und den Rollback. */
    applyLocalAssignment: (id: string, competitionMatchTeam: string | null) => void
}

/** Das Ziel eines Boots-Tipps: id plus „an diesem Posten schon fertig". */
type BoatTarget = {id: string; finished: boolean}

/**
 * Partie-Ansicht des Zielpostens: die erwarteten Partien mit ihren Booten, jedes Boot ein großer
 * Knopf. Der Haupt-Bedienfluss hat zwei gleichwertige Griffe:
 *
 * 1. **Erst stempeln, dann klicken:** die große Erfassungsfläche (oder die Leertaste) nimmt die
 *    Zeit im Moment der Ziellinie; die älteste unzugeordnete Zeit erscheint als Banner
 *    („12:01:33.4 zuordnen") und der nächste Tipp auf ein Boot hängt sie an dieses Boot.
 * 2. **Direkt aufs Boot:** kennt der Posten das einlaufende Boot, nimmt ein Tipp auf dessen
 *    Knopf Zeit und Zuordnung in einer Geste (der Weg des Team-Rasters).
 *
 * Boote im Ziel sind sichtbar abgehakt und gesperrt, fehlende sichtbar offen. Umhängen und Lösen
 * einer bereits zugeordneten Zeit übernimmt die Markenliste darunter — Verklicken ist der
 * Normalfall, deshalb bleibt jede genommene Zeit dort editierbar.
 */
const MatchCaptureView = ({
    eventId,
    matches,
    matchesLoading,
    marks,
    finishedTeams,
    capture,
    disabled,
    disabledReason,
    applyLocalAssignment,
}: MatchCaptureViewProps) => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    /** Bewusst vertagte Zeiten (unbekanntes Boot) — sie drängen sich nicht mehr als Banner auf. */
    const [skippedMarks, setSkippedMarks] = useState<Set<string>>(new Set())
    const pending = pendingAssignmentMark(marks, skippedMarks)

    const {current, upcoming} = expectedFinishMatches(matches)

    const handleBoat = useCallback(
        (team: BoatTarget) => {
            if (disabled || team.finished) return
            if (pending !== undefined) {
                // Zuordnungs-Klick: die wartende Zeit an dieses Boot hängen. Optimistisch, mit
                // Rollback — dasselbe Muster wie der kombinierte Erfassen+Zuordnen-Weg.
                const markId = pending.id
                applyLocalAssignment(markId, team.id)
                void assignCapturedMark(eventId, markId, team.id).then(ok => {
                    if (!ok) {
                        applyLocalAssignment(markId, null)
                        feedback.error(t('timing.assign.error'))
                    }
                })
                return
            }
            // Kein Stempel wartet: Zeit nehmen und sofort zuordnen, eine Geste.
            capture(team.id)
        },
        [disabled, pending, applyLocalAssignment, eventId, capture, feedback, t],
    )

    const renderMatch = (match: TimingMatchDto, dimmed: boolean) => {
        const teams = [...match.teams].sort((a, b) => a.startNumber - b.startNumber)
        const finishedCount = teams.filter(
            team => team.finished || finishedTeams.has(team.competitionMatchTeam),
        ).length
        return (
            <Stack key={match.competitionSetupMatch} spacing={1} sx={{opacity: dimmed ? 0.7 : 1}}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Typography variant="subtitle1" sx={{fontWeight: 600, flexGrow: 1}}>
                        {matchTitle(match)}
                    </Typography>
                    <ModeChip mode={match.timingMode} />
                    <ProgressChip progress={match.progress} />
                    <Typography variant="caption" color="text.secondary">
                        {t('timing.finish.finishedCount', {
                            finished: finishedCount,
                            total: teams.length,
                        })}
                    </Typography>
                </Stack>
                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                        gap: 1,
                    }}>
                    {teams.map(team => {
                        const done =
                            team.finished || finishedTeams.has(team.competitionMatchTeam)
                        return (
                            <ButtonBase
                                key={team.competitionMatchTeam}
                                // Wie im Team-Raster: der Zeitstempel gehört auf den physischen
                                // Druck, nicht auf das Loslassen.
                                onPointerDown={() =>
                                    handleBoat({id: team.competitionMatchTeam, finished: done})
                                }
                                onClick={event => event.preventDefault()}
                                disabled={done || disabled}
                                focusRipple
                                sx={{
                                    borderRadius: 2,
                                    p: 1,
                                    minHeight: 72,
                                    border: 2,
                                    // Wartet eine Zeit auf ihre Zuordnung, sind die Boote die
                                    // Zuordnungs-Ziele — sichtbar durch die Zielfarbe.
                                    borderColor:
                                        pending !== undefined && !done
                                            ? 'info.main'
                                            : 'divider',
                                    bgcolor: done
                                        ? 'action.disabledBackground'
                                        : 'background.paper',
                                    color: done ? 'text.disabled' : 'text.primary',
                                    opacity: done ? 0.6 : 1,
                                    textAlign: 'left',
                                    '&:active': done
                                        ? undefined
                                        : {bgcolor: 'action.selected'},
                                }}>
                                <Stack sx={{width: 1, minWidth: 0}} spacing={0.25}>
                                    <Stack direction="row" alignItems="center" spacing={0.5}>
                                        <Typography variant="h6" sx={{fontWeight: 700}}>
                                            #{team.startNumber}
                                        </Typography>
                                        <Box sx={{flexGrow: 1}} />
                                        {done && (
                                            <CheckCircleIcon
                                                color="success"
                                                fontSize="small"
                                            />
                                        )}
                                    </Stack>
                                    <Typography
                                        variant="body2"
                                        sx={{
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        }}>
                                        {team.teamName ?? team.clubName ?? ''}
                                    </Typography>
                                </Stack>
                            </ButtonBase>
                        )
                    })}
                </Box>
            </Stack>
        )
    }

    return (
        <Stack sx={{width: 1, minHeight: 0, flexGrow: 1}} spacing={1.5}>
            {pending !== undefined ? (
                <Alert
                    severity="info"
                    sx={{flexShrink: 0}}
                    action={
                        <Button
                            color="inherit"
                            size="small"
                            onClick={() =>
                                setSkippedMarks(prev => new Set(prev).add(pending.id))
                            }>
                            {t('timing.finish.assignLater')}
                        </Button>
                    }>
                    {t('timing.finish.assignPrompt', {
                        time: formatMarkTime(pending.timestampMillis),
                    })}
                </Alert>
            ) : (
                <Typography variant="caption" color="text.secondary" sx={{flexShrink: 0}}>
                    {t('timing.finish.hint')}
                </Typography>
            )}

            <Box sx={{flexGrow: 1, minHeight: 0, overflowY: 'auto'}}>
                <Stack spacing={2.5}>
                    {matchesLoading && matches.length === 0 && (
                        <Stack alignItems="center" sx={{py: 4}}>
                            <CircularProgress />
                        </Stack>
                    )}
                    {current.map(match => renderMatch(match, false))}
                    {current.length === 0 && upcoming !== undefined && (
                        <Stack spacing={1}>
                            <Typography variant="caption" color="text.secondary">
                                {t('timing.finish.upcomingTitle')}
                            </Typography>
                            {renderMatch(upcoming, true)}
                        </Stack>
                    )}
                    {!matchesLoading && current.length === 0 && upcoming === undefined && (
                        <Typography variant="body2" color="text.secondary" sx={{py: 2}}>
                            {t('timing.finish.noneExpected')}
                        </Typography>
                    )}
                </Stack>
            </Box>

            {disabled && disabledReason !== undefined && (
                <Typography variant="body2" color="error" textAlign="center" sx={{flexShrink: 0}}>
                    {disabledReason}
                </Typography>
            )}
        </Stack>
    )
}

export default MatchCaptureView
