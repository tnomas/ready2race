import {
    Alert,
    Box,
    Chip,
    FormControlLabel,
    IconButton,
    Link,
    Paper,
    Stack,
    Switch,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Tooltip,
    Typography,
} from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import LinkIcon from '@mui/icons-material/Link'
import {useCallback, useEffect, useMemo, useState} from 'react'
import {useTranslation} from 'react-i18next'
import {getTimingAutoApply, getTimingMatches, listTimingDeviceTokens, setTimingAutoApply} from '@api/sdk.gen.ts'
import {
    OfficialTimeDto,
    TimingMatchDto,
    TimingSequenceDto,
    TimingStationDto,
    TimingTeamDto,
} from '@api/types.gen.ts'
import {useFeedback, useFetch} from '@utils/hooks.ts'
import Throbber from '@components/Throbber.tsx'
import {BoardMark} from '@components/timing/useTimingBoardState.ts'
import OfficialTimeEditDialog from '@components/timing/leitstand/OfficialTimeEditDialog.tsx'
import {
    formatDuration,
    formatSeconds,
    formatTimeOfDay,
    teamLabel,
} from '@components/timing/leitstand/format.ts'
import {
    lastMarkByStation,
    recentlyActiveMatches,
    sequenceProgress,
} from '@components/timing/leitstand/overviewData.ts'

/** Mehr als eine Handvoll Läufe hilft niemandem - ältere stehen im Ergebnisse-Reiter. */
const RECENT_MATCH_LIMIT = 8

export type LeitstandOverviewTabProps = {
    eventId: string
    stations: TimingStationDto[]
    /** Alle Marken der Veranstaltung (Leitstand-Sicht ohne Postenfilter), live per Websocket. */
    marks: BoardMark[]
    teams: TimingTeamDto[]
    officialTimes: OfficialTimeDto[]
    /** Jüngste Sequenz je START-Posten (siehe `useStationSequences`). */
    sequences: ReadonlyMap<string, TimingSequenceDto>
    reloadOfficialTimes: () => void
}

/**
 * Die Standardansicht des Leitstands: oben der Schalter „Automatische Übernahme" und der kompakte
 * Posten-Streifen (Typ, letzter Eingang, laufende Sequenz, Geräte-Link), darunter die zuletzt
 * aktiven Läufe mit ihren offiziellen Zeiten.
 *
 * Live sind Marken und offizielle Zeiten (Websocket über die Seite); die Lauf-Stammdaten
 * (`/timing/matches`: Namen, Reihenfolge, Boote) werden einmal je Aufruf geladen - sie ändern sich
 * am Renntag nicht durch die Zeitnahme selbst. Strafen und Zeit-Korrekturen öffnen denselben
 * Dialog wie der Ergebnisse-Reiter.
 */
const LeitstandOverviewTab = ({
    eventId,
    stations,
    marks,
    teams,
    officialTimes,
    sequences,
    reloadOfficialTimes,
}: LeitstandOverviewTabProps) => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    // ---------------------------------------------------------------- Schalter

    const [autoApply, setAutoApply] = useState<boolean | null>(null)
    const [autoApplySaving, setAutoApplySaving] = useState(false)
    const [autoApplyError, setAutoApplyError] = useState(false)

    useEffect(() => {
        let disposed = false
        void (async () => {
            try {
                const {data, error} = await getTimingAutoApply({path: {eventId}})
                if (disposed) return
                if (error !== undefined || data === undefined) {
                    setAutoApplyError(true)
                    return
                }
                setAutoApply(data.enabled)
            } catch {
                if (!disposed) setAutoApplyError(true)
            }
        })()
        return () => {
            disposed = true
        }
    }, [eventId])

    const handleToggleAutoApply = useCallback(
        (enabled: boolean) => {
            setAutoApplySaving(true)
            setAutoApply(enabled)
            void (async () => {
                try {
                    const {error} = await setTimingAutoApply({path: {eventId}, body: {enabled}})
                    if (error !== undefined) {
                        setAutoApply(!enabled)
                        feedback.error(t('timing.leitstand.overview.autoApply.error'))
                        return
                    }
                    feedback.success(
                        t(
                            enabled
                                ? 'timing.leitstand.overview.autoApply.enabled'
                                : 'timing.leitstand.overview.autoApply.disabled',
                        ),
                    )
                    // Das Einschalten zieht serverseitig nach - die Tabelle soll das sofort zeigen,
                    // auch falls einzelne Websocket-Nachrichten verpasst wurden.
                    reloadOfficialTimes()
                } catch {
                    setAutoApply(!enabled)
                    feedback.error(t('common.error.unexpected'))
                } finally {
                    setAutoApplySaving(false)
                }
            })()
        },
        [eventId, feedback, reloadOfficialTimes, t],
    )

    // ---------------------------------------------------------------- Posten-Streifen

    const {data: deviceTokens} = useFetch(
        signal => listTimingDeviceTokens({signal, path: {eventId}}),
        {deps: [eventId]},
    )
    const stationsWithToken = useMemo(
        () =>
            new Set(
                (deviceTokens ?? []).filter(token => !token.revoked).map(token => token.station),
            ),
        [deviceTokens],
    )

    // Der Postenname im Streifen führt auf sein Board (neues Fenster), daneben die Adresse zum
    // Kopieren — die normale Board-URL ohne Token; der Token-Teilen-Fluss bleibt unverändert.
    const boardUrl = useCallback(
        (station: TimingStationDto) =>
            `${window.location.origin}/event/${eventId}/timing/${station.id}`,
        [eventId],
    )
    const copyBoardUrl = useCallback(
        (station: TimingStationDto) => {
            void navigator.clipboard.writeText(boardUrl(station))
            feedback.success(t('timing.station.urlCopied'))
        },
        [boardUrl, feedback, t],
    )

    const latestMarkByStation = useMemo(() => lastMarkByStation(marks), [marks])
    const teamById = useMemo(
        () => new Map(teams.map(team => [team.competitionMatchTeam, team])),
        [teams],
    )

    /** „Sequenz Finale CF2x: 3/6 gestartet" - der Lauf kommt über die Teams der Einträge. */
    const sequenceLine = useCallback(
        (sequence: TimingSequenceDto): string | null => {
            if (sequence.state !== 'ARMED' && sequence.state !== 'RUNNING') return null
            const progress = sequenceProgress(sequence)
            const firstTeam = sequence.entries
                .map(entry => teamById.get(entry.competitionMatchTeam))
                .find(team => team !== undefined)
            const matchLabel = [firstTeam?.competitionName, firstTeam?.matchName]
                .filter((part): part is string => !!part)
                .join(' · ')
            return t('timing.leitstand.overview.stations.sequence', {
                match: matchLabel.length > 0 ? matchLabel : t('timing.leitstand.overview.stations.sequenceUnknown'),
                started: progress.started,
                total: progress.total,
            })
        },
        [teamById, t],
    )

    // ---------------------------------------------------------------- Zuletzt aktive Läufe

    const {
        data: matchesData,
        pending: matchesPending,
        error: matchesError,
    } = useFetch(signal => getTimingMatches({signal, path: {eventId}}), {deps: [eventId]})

    const officialByTeam = useMemo(
        () => new Map(officialTimes.map(entry => [entry.competitionMatchTeam, entry])),
        [officialTimes],
    )

    const recent = useMemo(
        () => recentlyActiveMatches(matchesData ?? [], marks, RECENT_MATCH_LIMIT),
        [matchesData, marks],
    )

    const [editTeamId, setEditTeamId] = useState<string | null>(null)

    const matchTitle = (match: TimingMatchDto): string =>
        [
            [match.competitionIdentifier, match.competitionName]
                .filter((part): part is string => !!part)
                .join(' '),
            match.matchName ?? match.roundName ?? undefined,
        ]
            .filter((part): part is string => !!part && part.length > 0)
            .join(' · ')

    return (
        <Stack spacing={2} sx={{width: 1}}>
            <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
                <FormControlLabel
                    control={
                        <Switch
                            checked={autoApply === true}
                            disabled={autoApply === null || autoApplySaving}
                            onChange={event => handleToggleAutoApply(event.target.checked)}
                        />
                    }
                    label={t('timing.leitstand.overview.autoApply.label')}
                />
                <Typography variant="body2" color="text.secondary">
                    {autoApply === false
                        ? t('timing.leitstand.overview.autoApply.hintOff')
                        : t('timing.leitstand.overview.autoApply.hintOn')}
                </Typography>
            </Stack>
            {autoApplyError && (
                <Alert severity="warning">
                    {t('timing.leitstand.overview.autoApply.loadError')}
                </Alert>
            )}

            <Box sx={{display: 'flex', gap: 1.5, overflowX: 'auto', pb: 0.5}}>
                {[...stations]
                    .sort((a, b) => a.sorting - b.sorting)
                    .map(station => {
                        const lastMark = latestMarkByStation.get(station.id)
                        const sequence = sequences.get(station.id)
                        const line = sequence !== undefined ? sequenceLine(sequence) : null
                        return (
                            <Paper
                                key={station.id}
                                variant="outlined"
                                sx={{p: 1.5, minWidth: 220, flexShrink: 0}}>
                                <Stack spacing={0.5}>
                                    <Stack direction="row" spacing={1} alignItems="center">
                                        <Typography variant="subtitle2" sx={{flexGrow: 1}}>
                                            <Link
                                                href={boardUrl(station)}
                                                target="_blank"
                                                rel="noopener"
                                                underline="hover"
                                                color="inherit">
                                                {station.name}
                                            </Link>
                                        </Typography>
                                        <Tooltip title={t('timing.station.copyUrl')}>
                                            <IconButton
                                                size="small"
                                                aria-label={t('timing.station.copyUrl')}
                                                onClick={() => copyBoardUrl(station)}>
                                                <ContentCopyIcon fontSize="inherit" />
                                            </IconButton>
                                        </Tooltip>
                                        {stationsWithToken.has(station.id) && (
                                            <Tooltip
                                                title={t(
                                                    'timing.leitstand.overview.stations.shareLink',
                                                )}>
                                                <LinkIcon fontSize="small" color="action" />
                                            </Tooltip>
                                        )}
                                        <Chip
                                            size="small"
                                            label={t(`timing.station.types.${station.type}`)}
                                        />
                                    </Stack>
                                    <Typography variant="caption" color="text.secondary">
                                        {lastMark !== undefined
                                            ? t('timing.leitstand.overview.stations.lastMark', {
                                                  time: formatTimeOfDay(lastMark),
                                              })
                                            : t('timing.leitstand.overview.stations.noMarks')}
                                    </Typography>
                                    {line !== null && (
                                        <Typography variant="caption" color="primary">
                                            {line}
                                        </Typography>
                                    )}
                                </Stack>
                            </Paper>
                        )
                    })}
                {stations.length === 0 && (
                    <Typography variant="body2" color="text.secondary">
                        {t('timing.leitstand.overview.stations.empty')}
                    </Typography>
                )}
            </Box>

            <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="h6">
                    {t('timing.leitstand.overview.matches.title')}
                </Typography>
                {matchesPending && <Throbber />}
            </Stack>
            {matchesError !== null && (
                <Alert severity="error">{t('timing.matches.loadError')}</Alert>
            )}
            {recent.length === 0 && !matchesPending && matchesError === null && (
                <Typography variant="body2" color="text.secondary">
                    {t('timing.leitstand.overview.matches.empty')}
                </Typography>
            )}
            <Stack spacing={2}>
                {recent.map(({match}) => (
                    <Paper key={match.competitionSetupMatch} variant="outlined" sx={{p: 2}}>
                        <Stack
                            direction="row"
                            spacing={1}
                            alignItems="center"
                            flexWrap="wrap"
                            useFlexGap
                            sx={{mb: 1}}>
                            <Typography variant="subtitle1" sx={{flexGrow: 1}}>
                                {matchTitle(match)}
                            </Typography>
                            <Chip
                                size="small"
                                label={t(
                                    `timing.leitstand.overview.matches.progress.${match.progress}`,
                                )}
                            />
                        </Stack>
                        <Box sx={{overflowX: 'auto'}}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>
                                            {t('timing.leitstand.results.column.team')}
                                        </TableCell>
                                        <TableCell>
                                            {t('timing.leitstand.results.column.effective')}
                                        </TableCell>
                                        <TableCell>
                                            {t('timing.leitstand.results.column.penalty')}
                                        </TableCell>
                                        <TableCell align="right">{t('common.actions')}</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {match.teams.map(team => {
                                        const official = officialByTeam.get(
                                            team.competitionMatchTeam,
                                        )
                                        return (
                                            <TableRow key={team.competitionMatchTeam} hover>
                                                <TableCell>
                                                    {teamLabel(
                                                        teamById.get(team.competitionMatchTeam),
                                                        team.competitionMatchTeam,
                                                    )}
                                                </TableCell>
                                                <TableCell
                                                    sx={{
                                                        fontFamily: 'monospace',
                                                        fontVariantNumeric: 'tabular-nums',
                                                    }}>
                                                    {official !== undefined &&
                                                    official.resultStatus !== 'NONE' ? (
                                                        <Chip
                                                            size="small"
                                                            color="warning"
                                                            label={t(
                                                                `timing.leitstand.results.status.${official.resultStatus}`,
                                                            )}
                                                        />
                                                    ) : official?.effectiveMillis !== undefined ? (
                                                        formatDuration(official.effectiveMillis)
                                                    ) : (
                                                        '–'
                                                    )}
                                                    {official?.dirty === true && (
                                                        <Tooltip
                                                            title={t(
                                                                'timing.leitstand.results.dirtyHint',
                                                            )}>
                                                            <Chip
                                                                size="small"
                                                                color="warning"
                                                                sx={{ml: 1}}
                                                                label={t(
                                                                    'timing.leitstand.results.dirty',
                                                                )}
                                                            />
                                                        </Tooltip>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    {official !== undefined &&
                                                    official.penaltyMillis !== 0 ? (
                                                        <>
                                                            {t(
                                                                'timing.leitstand.results.penaltyValue',
                                                                {
                                                                    seconds: formatSeconds(
                                                                        official.penaltyMillis,
                                                                    ),
                                                                },
                                                            )}
                                                            {!!official.penaltyNote && (
                                                                <Typography
                                                                    variant="caption"
                                                                    color="text.secondary"
                                                                    display="block">
                                                                    {official.penaltyNote}
                                                                </Typography>
                                                            )}
                                                        </>
                                                    ) : (
                                                        '–'
                                                    )}
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Tooltip
                                                        title={t(
                                                            'timing.leitstand.results.edit.action',
                                                        )}>
                                                        <IconButton
                                                            size="small"
                                                            aria-label={t(
                                                                'timing.leitstand.results.edit.action',
                                                            )}
                                                            onClick={() =>
                                                                setEditTeamId(
                                                                    team.competitionMatchTeam,
                                                                )
                                                            }>
                                                            <EditIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        </Box>
                    </Paper>
                ))}
            </Stack>

            {editTeamId !== null && (
                <OfficialTimeEditDialog
                    open
                    onClose={() => setEditTeamId(null)}
                    eventId={eventId}
                    competitionMatchTeam={editTeamId}
                    teamLabel={teamLabel(teamById.get(editTeamId), editTeamId)}
                    official={officialByTeam.get(editTeamId)}
                    onSaved={reloadOfficialTimes}
                />
            )}
        </Stack>
    )
}

export default LeitstandOverviewTab
