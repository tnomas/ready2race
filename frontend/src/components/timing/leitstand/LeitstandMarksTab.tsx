import {
    Box,
    Button,
    Checkbox,
    Chip,
    FormControlLabel,
    IconButton,
    MenuItem,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material'
import DeleteForeverIcon from '@mui/icons-material/DeleteForever'
import EditIcon from '@mui/icons-material/Edit'
import UndoIcon from '@mui/icons-material/Undo'
import {useCallback, useEffect, useMemo, useState} from 'react'
import {useTranslation} from 'react-i18next'
import {deleteRetractedTimeMarks, retractTimeMark} from '@api/sdk.gen.ts'
import {TimingStationDto, TimingTeamDto} from '@api/types.gen.ts'
import {useConfirmation} from '@contexts/confirmation/ConfirmationContext.ts'
import {useFeedback} from '@utils/hooks.ts'
import AssignTeamDialog from '@components/timing/AssignTeamDialog.tsx'
import {BoardMark} from '@components/timing/useTimingBoardState.ts'
import {formatTimeOfDay, teamLabel} from '@components/timing/leitstand/format.ts'

/** Sentinel for the station filter's "all stations" option (a Select cannot hold `null` cleanly). */
const ALL_STATIONS = 'ALL'

export type LeitstandMarksTabProps = {
    eventId: string
    /** Every mark of the event, across all stations (`useTimingBoardState(eventId, null)`). */
    marks: BoardMark[]
    stations: TimingStationDto[]
    teams: TimingTeamDto[]
    teamsLoading: boolean
}

/**
 * Cross-station table of every captured mark, with the correction tools an operator needs from the
 * control desk: re-assigning (or detaching) a team, retracting a mark, and the explicit
 * "delete retracted times" flow.
 *
 * Deliberately *not* built on `MarkList`: that component numbers marks per station in first-seen
 * order (operators reference "#7 at the finish" verbally), which has no meaning in a merged
 * cross-station list. The Leitstand instead identifies a row by station + time of day.
 *
 * The delete flow only ever removes RETRACTED marks — the server enforces that, and the button's
 * count reflects the current filter so "delete everything retracted at the finish" is one click. The
 * rows disappear through the websocket `timesDeleted` echo, not optimistically, so what is shown
 * always matches what the server actually deleted.
 */
const LeitstandMarksTab = ({
    eventId,
    marks,
    stations,
    teams,
    teamsLoading,
}: LeitstandMarksTabProps) => {
    const {t} = useTranslation()
    const feedback = useFeedback()
    const {confirmAction} = useConfirmation()

    const [stationFilter, setStationFilter] = useState<string>(ALL_STATIONS)
    const [unassignedOnly, setUnassignedOnly] = useState(false)
    const [retracting, setRetracting] = useState<Set<string>>(new Set())
    const [deleting, setDeleting] = useState(false)
    const [assignDialogMarkId, setAssignDialogMarkId] = useState<string | null>(null)
    /** Optimistic overlay for an assign/detach that has not been echoed by the websocket yet. */
    const [localAssignments, setLocalAssignments] = useState<Map<string, string | null>>(new Map())

    const stationById = useMemo(() => new Map(stations.map(s => [s.id, s])), [stations])
    const teamById = useMemo(() => new Map(teams.map(team => [team.competitionMatchTeam, team])), [teams])

    // A station that disappears from the event (deleted while the board is open) must not leave the
    // table filtered to nothing with no way back — fall back to "all stations".
    useEffect(() => {
        if (stationFilter !== ALL_STATIONS && !stationById.has(stationFilter)) {
            setStationFilter(ALL_STATIONS)
        }
    }, [stationFilter, stationById])

    // Drop optimistic overlays that the real state has caught up with, so neither collection grows
    // unbounded over a long session (same cleanup shape as `MarkList`).
    useEffect(() => {
        setLocalAssignments(prev => {
            if (prev.size === 0) return prev
            let next: Map<string, string | null> | null = null
            for (const [markId, optimistic] of prev) {
                const mark = marks.find(m => m.id === markId)
                if (mark === undefined || (mark.assignedTeam ?? null) === optimistic) {
                    next = next ?? new Map(prev)
                    next.delete(markId)
                }
            }
            return next ?? prev
        })
        setRetracting(prev => {
            if (prev.size === 0) return prev
            const next = new Set(prev)
            let changed = false
            for (const id of prev) {
                const mark = marks.find(m => m.id === id)
                if (mark === undefined || mark.status === 'RETRACTED') {
                    next.delete(id)
                    changed = true
                }
            }
            return changed ? next : prev
        })
    }, [marks])

    const effectiveTeamOf = useCallback(
        (mark: BoardMark): string | null =>
            localAssignments.has(mark.id)
                ? (localAssignments.get(mark.id) ?? null)
                : (mark.assignedTeam ?? null),
        [localAssignments],
    )

    const stationFiltered = useMemo(
        () => (stationFilter === ALL_STATIONS ? marks : marks.filter(m => m.station === stationFilter)),
        [marks, stationFilter],
    )

    const visibleMarks = useMemo(() => {
        const filtered = unassignedOnly
            ? stationFiltered.filter(m => effectiveTeamOf(m) === null)
            : stationFiltered
        return [...filtered].sort((a, b) => b.timestampMillis - a.timestampMillis)
    }, [stationFiltered, unassignedOnly, effectiveTeamOf])

    // Counted on the station-filtered set (not the fully filtered one): the delete call takes an
    // optional station, so the number has to describe exactly what the request would remove.
    const retractedCount = useMemo(
        () => stationFiltered.filter(m => m.status === 'RETRACTED' && !m.pending && !m.failed).length,
        [stationFiltered],
    )

    const handleAssign = useCallback(
        (markId: string, competitionMatchTeam: string | null) => {
            setLocalAssignments(prev => {
                const mark = marks.find(m => m.id === markId)
                if ((mark?.assignedTeam ?? null) === competitionMatchTeam) {
                    const next = new Map(prev)
                    next.delete(markId)
                    return next
                }
                return new Map(prev).set(markId, competitionMatchTeam)
            })
        },
        [marks],
    )

    const handleRetract = useCallback(
        (mark: BoardMark) => {
            setRetracting(prev => new Set(prev).add(mark.id))
            const rollback = () => {
                setRetracting(prev => {
                    const next = new Set(prev)
                    next.delete(mark.id)
                    return next
                })
                feedback.error(t('timing.mark.retractError'))
            }
            void (async () => {
                try {
                    const {error} = await retractTimeMark({path: {eventId, timeMarkId: mark.id}})
                    if (error !== undefined) rollback()
                } catch {
                    rollback()
                }
            })()
        },
        [eventId, feedback, t],
    )

    const handleDeleteRetracted = useCallback(() => {
        const stationName =
            stationFilter === ALL_STATIONS
                ? undefined
                : (stationById.get(stationFilter)?.name ?? stationFilter)
        confirmAction(
            () => {
                setDeleting(true)
                void (async () => {
                    try {
                        const {data, error} = await deleteRetractedTimeMarks({
                            path: {eventId},
                            query: stationFilter === ALL_STATIONS ? undefined : {station: stationFilter},
                        })
                        if (error !== undefined || data === undefined) {
                            feedback.error(t('timing.leitstand.marks.delete.error'))
                            return
                        }
                        feedback.success(
                            t('timing.leitstand.marks.delete.success', {count: data.timeMarks.length}),
                        )
                    } catch {
                        feedback.error(t('timing.leitstand.marks.delete.error'))
                    } finally {
                        setDeleting(false)
                    }
                })()
            },
            {
                title: t('timing.leitstand.marks.delete.confirm.title'),
                content:
                    stationName === undefined
                        ? t('timing.leitstand.marks.delete.confirm.contentAll', {count: retractedCount})
                        : t('timing.leitstand.marks.delete.confirm.contentStation', {
                              count: retractedCount,
                              station: stationName,
                          }),
                okText: t('timing.leitstand.marks.delete.action'),
            },
        )
    }, [confirmAction, eventId, feedback, retractedCount, stationById, stationFilter, t])

    const rawAssignDialogMark = marks.find(m => m.id === assignDialogMarkId)
    const assignDialogMark =
        rawAssignDialogMark !== undefined && localAssignments.has(rawAssignDialogMark.id)
            ? {
                  ...rawAssignDialogMark,
                  assignedTeam: localAssignments.get(rawAssignDialogMark.id) ?? undefined,
              }
            : rawAssignDialogMark

    return (
        <Stack spacing={2} sx={{width: 1}}>
            <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
                <TextField
                    select
                    size="small"
                    label={t('timing.leitstand.marks.stationFilter')}
                    value={stationFilter}
                    onChange={event => setStationFilter(event.target.value)}
                    sx={{minWidth: 220}}>
                    <MenuItem value={ALL_STATIONS}>{t('timing.leitstand.marks.allStations')}</MenuItem>
                    {[...stations]
                        .sort((a, b) => a.sorting - b.sorting)
                        .map(station => (
                            <MenuItem key={station.id} value={station.id}>
                                {station.name}
                            </MenuItem>
                        ))}
                </TextField>
                <FormControlLabel
                    control={
                        <Checkbox
                            checked={unassignedOnly}
                            onChange={event => setUnassignedOnly(event.target.checked)}
                        />
                    }
                    label={t('timing.leitstand.marks.unassignedOnly')}
                />
                <Box sx={{flexGrow: 1}} />
                <Typography variant="body2" color="text.secondary">
                    {t('timing.leitstand.marks.count', {count: visibleMarks.length})}
                </Typography>
            </Stack>

            <Box sx={{overflowX: 'auto', width: 1}}>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>{t('timing.leitstand.marks.column.station')}</TableCell>
                            <TableCell>{t('timing.leitstand.marks.column.time')}</TableCell>
                            <TableCell>{t('timing.leitstand.marks.column.status')}</TableCell>
                            <TableCell>{t('timing.leitstand.marks.column.source')}</TableCell>
                            <TableCell>{t('timing.leitstand.marks.column.team')}</TableCell>
                            <TableCell align="right">
                                {t('timing.leitstand.marks.column.actions')}
                            </TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {visibleMarks.map(mark => {
                            const isRetracted = mark.status === 'RETRACTED' || retracting.has(mark.id)
                            // `pending`/`failed` marks exist only in this tab's memory (a capture from
                            // another board would never appear here), but the guard is kept so a
                            // never-saved mark can't be retracted or assigned into a 404.
                            const isOnServer = !mark.pending && !mark.failed
                            const teamId = effectiveTeamOf(mark)
                            return (
                                <TableRow key={mark.id} hover>
                                    <TableCell>
                                        {stationById.get(mark.station)?.name ?? mark.station.slice(0, 8)}
                                    </TableCell>
                                    <TableCell
                                        sx={{
                                            fontFamily: 'monospace',
                                            fontVariantNumeric: 'tabular-nums',
                                            textDecoration: isRetracted ? 'line-through' : 'none',
                                            color: isRetracted ? 'text.disabled' : 'text.primary',
                                        }}>
                                        {formatTimeOfDay(mark.timestampMillis)}
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            size="small"
                                            color={isRetracted ? 'default' : 'success'}
                                            label={t(
                                                `timing.leitstand.marks.status.${isRetracted ? 'RETRACTED' : 'ACTIVE'}`,
                                            )}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="body2" color="text.secondary">
                                            {/* `source` is a plain string in the generated DTO, so
                                                the two known values are matched explicitly and
                                                anything else falls back to the raw value rather than
                                                being mislabelled. */}
                                            {mark.source === 'HARDWARE'
                                                ? t('timing.leitstand.marks.source.HARDWARE')
                                                : mark.source === 'APP_USER'
                                                  ? t('timing.leitstand.marks.source.APP_USER')
                                                  : mark.source}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        {teamId === null ? (
                                            <Typography variant="body2" color="text.secondary">
                                                {t('timing.leitstand.marks.unassigned')}
                                            </Typography>
                                        ) : (
                                            <Typography variant="body2">
                                                {teamLabel(teamById.get(teamId), teamId)}
                                            </Typography>
                                        )}
                                    </TableCell>
                                    <TableCell align="right">
                                        <Stack
                                            direction="row"
                                            spacing={0.5}
                                            justifyContent="flex-end"
                                            alignItems="center">
                                            {isOnServer && !isRetracted && (
                                                <Tooltip
                                                    title={
                                                        teamId === null
                                                            ? t('timing.assign.assign')
                                                            : t('timing.assign.edit')
                                                    }>
                                                    <IconButton
                                                        size="small"
                                                        aria-label={
                                                            teamId === null
                                                                ? t('timing.assign.assign')
                                                                : t('timing.assign.edit')
                                                        }
                                                        onClick={() => setAssignDialogMarkId(mark.id)}>
                                                        <EditIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                            )}
                                            {isOnServer && !isRetracted && (
                                                <Tooltip title={t('timing.board.mark.undo')}>
                                                    <IconButton
                                                        size="small"
                                                        aria-label={t('timing.board.mark.undo')}
                                                        onClick={() => handleRetract(mark)}>
                                                        <UndoIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                            )}
                                        </Stack>
                                    </TableCell>
                                </TableRow>
                            )
                        })}
                        {visibleMarks.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6}>
                                    <Typography variant="body2" color="text.secondary">
                                        {t('timing.leitstand.marks.empty')}
                                    </Typography>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </Box>

            <Stack
                direction="row"
                spacing={2}
                alignItems="center"
                sx={{borderTop: 1, borderColor: 'divider', pt: 2}}>
                <Button
                    color="error"
                    variant="outlined"
                    startIcon={<DeleteForeverIcon />}
                    disabled={deleting || retractedCount === 0}
                    onClick={handleDeleteRetracted}>
                    {t('timing.leitstand.marks.delete.action')}
                </Button>
                <Typography variant="body2" color="text.secondary">
                    {t('timing.leitstand.marks.delete.hint', {count: retractedCount})}
                </Typography>
            </Stack>

            {assignDialogMark !== undefined && (
                <AssignTeamDialog
                    open
                    onClose={() => setAssignDialogMarkId(null)}
                    eventId={eventId}
                    mark={assignDialogMark}
                    teams={teams}
                    teamsLoading={teamsLoading}
                    onAssign={handleAssign}
                />
            )}
        </Stack>
    )
}

export default LeitstandMarksTab
