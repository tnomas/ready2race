import {
    Box,
    Button,
    Checkbox,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    IconButton,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Tooltip,
    Typography,
} from '@mui/material'
import CalculateIcon from '@mui/icons-material/Calculate'
import EditIcon from '@mui/icons-material/Edit'
import PublishIcon from '@mui/icons-material/Publish'
import {useCallback, useMemo, useState} from 'react'
import {useTranslation} from 'react-i18next'
import {format} from 'date-fns'
import {computeOfficialTimes, pushOfficialTimes} from '@api/sdk.gen.ts'
import {
    OfficialTimeDto,
    OfficialTimePushConflictDto,
    OfficialTimeSkipDto,
    TimingTeamDto,
} from '@api/types.gen.ts'
import {useConfirmation} from '@contexts/confirmation/ConfirmationContext.ts'
import {useFeedback} from '@utils/hooks.ts'
import Throbber from '@components/Throbber.tsx'
import OfficialTimeEditDialog from '@components/timing/leitstand/OfficialTimeEditDialog.tsx'
import {
    formatDuration,
    formatSeconds,
    formatTimeOfDay,
    teamContextLabel,
    teamLabel,
} from '@components/timing/leitstand/format.ts'

export type LeitstandResultsTabProps = {
    eventId: string
    teams: TimingTeamDto[]
    officialTimes: OfficialTimeDto[]
    officialTimesPending: boolean
    reloadOfficialTimes: () => void
}

type ResultRow = {
    competitionMatchTeam: string
    team: TimingTeamDto | undefined
    official: OfficialTimeDto | undefined
}

/**
 * Read `details.conflicts` out of the backend's 409 body without trusting its shape.
 *
 * The generated error type for the push is `unknown` (the tsp contract only declares the success
 * response), so the conflict list has to be narrowed by hand. Returns an empty array when the body
 * doesn't carry a usable conflict list, which the caller treats as "generic failure" rather than
 * "no conflicts".
 */
function extractConflicts(error: unknown): OfficialTimePushConflictDto[] {
    if (typeof error !== 'object' || error === null) return []
    const details = (error as {details?: unknown}).details
    if (typeof details !== 'object' || details === null) return []
    const conflicts = (details as {conflicts?: unknown}).conflicts
    if (!Array.isArray(conflicts)) return []
    return conflicts.filter(
        (entry): entry is OfficialTimePushConflictDto =>
            typeof entry === 'object' &&
            entry !== null &&
            typeof (entry as {competitionMatchTeam?: unknown}).competitionMatchTeam === 'string' &&
            typeof (entry as {reason?: unknown}).reason === 'string',
    )
}

/**
 * The Leitstand's result table: one row per team of the event, joined with its official time.
 *
 * Start/finish are the values a *recompute* would use (resolved by the backend from the team's
 * currently assigned, non-retracted marks) shown next to what the stored official time actually says
 * — that pairing is what makes a `dirty` row diagnosable: it says "a timing edit happened since this
 * was computed/pushed", and the two columns show whether it matters.
 *
 * Rows are built from `teams` (not from `officialTimes`), so a team that has no official time yet is
 * still listed and can be given an override before anything was ever computed. An official time
 * without a matching team — a team removed from the event after the fact — is appended rather than
 * silently dropped, identified by its raw id.
 *
 * Push targets the current selection, or, when nothing is selected, every row that has something to
 * write (an effective time, or a DNS/DNF/DSQ status, which the push writes as a `failed` result
 * without a timecode). A 409 lists the conflicting teams; `RESULT_FROZEN` can be forced through after
 * an explicit confirmation, `NO_EFFECTIVE_TIME` cannot — there would be nothing to write.
 */
const LeitstandResultsTab = ({
    eventId,
    teams,
    officialTimes,
    officialTimesPending,
    reloadOfficialTimes,
}: LeitstandResultsTabProps) => {
    const {t} = useTranslation()
    const feedback = useFeedback()
    const {confirmAction} = useConfirmation()

    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [computing, setComputing] = useState(false)
    const [pushing, setPushing] = useState(false)
    const [editTeamId, setEditTeamId] = useState<string | null>(null)
    const [computeResult, setComputeResult] = useState<{
        computed: number
        skipped: OfficialTimeSkipDto[]
    } | null>(null)
    const [conflicts, setConflicts] = useState<{
        list: OfficialTimePushConflictDto[]
        teams: string[]
    } | null>(null)

    const officialByTeam = useMemo(
        () => new Map(officialTimes.map(entry => [entry.competitionMatchTeam, entry])),
        [officialTimes],
    )
    const teamById = useMemo(() => new Map(teams.map(team => [team.competitionMatchTeam, team])), [teams])

    const rows = useMemo<ResultRow[]>(() => {
        const known = new Set(teams.map(team => team.competitionMatchTeam))
        const fromTeams = teams.map(team => ({
            competitionMatchTeam: team.competitionMatchTeam,
            team,
            official: officialByTeam.get(team.competitionMatchTeam),
        }))
        const orphaned = officialTimes
            .filter(entry => !known.has(entry.competitionMatchTeam))
            .map(entry => ({
                competitionMatchTeam: entry.competitionMatchTeam,
                team: undefined,
                official: entry,
            }))
        return [...fromTeams, ...orphaned]
    }, [teams, officialTimes, officialByTeam])

    /** Rows the push has something to write for: an effective time, or a non-NONE status. */
    const pushableIds = useMemo(
        () =>
            rows
                .filter(
                    row =>
                        row.official !== undefined &&
                        (row.official.effectiveMillis !== undefined ||
                            row.official.resultStatus !== 'NONE'),
                )
                .map(row => row.competitionMatchTeam),
        [rows],
    )

    const toggleSelected = useCallback((teamId: string) => {
        setSelected(prev => {
            const next = new Set(prev)
            if (next.has(teamId)) next.delete(teamId)
            else next.add(teamId)
            return next
        })
    }, [])

    const allPushableSelected =
        pushableIds.length > 0 && pushableIds.every(id => selected.has(id)) && selected.size > 0

    // Select all pushable rows unless every one of them is already selected, in which case clear.
    // Using `prev.size > 0` here (instead of "all selected") would make the indeterminate state (some,
    // but not all, rows selected) toggle to *nothing selected* instead of *everything selected*.
    const toggleSelectAll = useCallback(() => {
        setSelected(prev => {
            const allSelected = pushableIds.length > 0 && pushableIds.every(id => prev.has(id))
            return allSelected ? new Set() : new Set(pushableIds)
        })
    }, [pushableIds])

    const handleCompute = useCallback(() => {
        setComputing(true)
        void (async () => {
            try {
                // Empty body = every team of the event; the per-team form exists on the API but the
                // Leitstand's "Neu berechnen" is deliberately the whole event (a recompute never
                // touches overrides, penalties or statuses, so it is safe to run broadly).
                const {data, error} = await computeOfficialTimes({path: {eventId}, body: {}})
                if (error !== undefined || data === undefined) {
                    feedback.error(t('timing.leitstand.results.compute.error'))
                    return
                }
                setComputeResult({computed: data.computed.length, skipped: data.skipped})
                reloadOfficialTimes()
            } catch {
                feedback.error(t('common.error.unexpected'))
            } finally {
                setComputing(false)
            }
        })()
    }, [eventId, feedback, reloadOfficialTimes, t])

    const runPush = useCallback(
        (teamIds: string[], force: boolean) => {
            setPushing(true)
            void (async () => {
                try {
                    const {error} = await pushOfficialTimes({
                        path: {eventId},
                        body: {teams: teamIds, force},
                    })
                    if (error !== undefined) {
                        const list = extractConflicts(error)
                        if (list.length > 0) {
                            setConflicts({list, teams: teamIds})
                        } else {
                            feedback.error(t('timing.leitstand.results.push.error'))
                        }
                        return
                    }
                    feedback.success(
                        t('timing.leitstand.results.push.success', {count: teamIds.length}),
                    )
                    setConflicts(null)
                    setSelected(new Set())
                    reloadOfficialTimes()
                } catch {
                    feedback.error(t('common.error.unexpected'))
                } finally {
                    setPushing(false)
                }
            })()
        },
        [eventId, feedback, reloadOfficialTimes, t],
    )

    const handlePush = useCallback(() => {
        const teamIds = selected.size > 0 ? [...selected] : pushableIds
        if (teamIds.length === 0) {
            feedback.warning(t('timing.leitstand.results.push.nothing'))
            return
        }
        if (selected.size === 0) {
            // Nothing is selected, which pushes every transferable row in the event. Confirm and name
            // the count so an operator who simply forgot to select specific teams doesn't silently
            // push results for the whole event.
            confirmAction(() => runPush(teamIds, false), {
                title: t('timing.leitstand.results.push.confirmAll.title'),
                content: t('timing.leitstand.results.push.confirmAll.content', {
                    count: teamIds.length,
                }),
            })
            return
        }
        runPush(teamIds, false)
    }, [selected, pushableIds, runPush, feedback, t, confirmAction])

    const handleForcePush = useCallback(() => {
        if (conflicts === null) return
        // `force` only overrides the freeze; a team with neither time nor status still has nothing to
        // write and would just fail the whole call again. Drop those from the retry so the forced push
        // actually lands for the teams it can help.
        const unfixable = new Set(
            conflicts.list
                .filter(conflict => conflict.reason === 'NO_EFFECTIVE_TIME')
                .map(conflict => conflict.competitionMatchTeam),
        )
        const teamIds = conflicts.teams.filter(id => !unfixable.has(id))
        if (teamIds.length === 0) return

        // Name exactly what the force-push overrides: the frozen teams' start numbers, not just an
        // abstract "these teams" — the operator should be able to recognize them without cross-checking
        // the list above.
        const frozenNumbers = conflicts.list
            .filter(conflict => conflict.reason === 'RESULT_FROZEN')
            .map(conflict => teamById.get(conflict.competitionMatchTeam)?.startNumber)
            .filter((startNumber): startNumber is number => startNumber !== undefined)
            .sort((a, b) => a - b)

        confirmAction(() => runPush(teamIds, true), {
            title: t('timing.leitstand.results.push.forceConfirm.title'),
            content: t('timing.leitstand.results.push.forceConfirm.content', {
                count: frozenNumbers.length,
                numbers: frozenNumbers.join(', '),
            }),
            okText: t('timing.leitstand.results.push.force'),
        })
    }, [conflicts, confirmAction, runPush, t, teamById])

    const forceable = conflicts?.list.some(conflict => conflict.reason === 'RESULT_FROZEN') ?? false

    const editRow = rows.find(row => row.competitionMatchTeam === editTeamId)

    return (
        <Stack spacing={2} sx={{width: 1}}>
            <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
                <Button
                    variant="outlined"
                    startIcon={<CalculateIcon />}
                    disabled={computing}
                    onClick={handleCompute}>
                    {t('timing.leitstand.results.compute.action')}
                </Button>
                <Button
                    variant="contained"
                    startIcon={<PublishIcon />}
                    disabled={pushing || (selected.size === 0 && pushableIds.length === 0)}
                    onClick={handlePush}>
                    {t('timing.leitstand.results.push.action')}
                </Button>
                <Typography variant="body2" color="text.secondary">
                    {selected.size > 0
                        ? t('timing.leitstand.results.selectedCount', {count: selected.size})
                        : t('timing.leitstand.results.pushableCount', {count: pushableIds.length})}
                </Typography>
                <Box sx={{flexGrow: 1}} />
                {officialTimesPending && <Throbber />}
            </Stack>

            <Box sx={{overflowX: 'auto', width: 1}}>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell padding="checkbox">
                                <Checkbox
                                    checked={allPushableSelected}
                                    indeterminate={selected.size > 0 && !allPushableSelected}
                                    disabled={pushableIds.length === 0}
                                    onChange={toggleSelectAll}
                                    inputProps={{
                                        'aria-label': t('common.selectAll'),
                                    }}
                                />
                            </TableCell>
                            <TableCell>{t('timing.leitstand.results.column.team')}</TableCell>
                            <TableCell>{t('timing.leitstand.results.column.start')}</TableCell>
                            <TableCell>{t('timing.leitstand.results.column.finish')}</TableCell>
                            <TableCell>{t('timing.leitstand.results.column.computed')}</TableCell>
                            <TableCell>{t('timing.leitstand.results.column.override')}</TableCell>
                            <TableCell>{t('timing.leitstand.results.column.penalty')}</TableCell>
                            <TableCell>{t('timing.leitstand.results.column.status')}</TableCell>
                            <TableCell>{t('timing.leitstand.results.column.effective')}</TableCell>
                            <TableCell>{t('timing.leitstand.results.column.pushed')}</TableCell>
                            <TableCell align="right">{t('common.actions')}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {rows.map(row => {
                            const official = row.official
                            const context = teamContextLabel(row.team)
                            return (
                                <TableRow key={row.competitionMatchTeam} hover>
                                    <TableCell padding="checkbox">
                                        <Checkbox
                                            checked={selected.has(row.competitionMatchTeam)}
                                            onChange={() => toggleSelected(row.competitionMatchTeam)}
                                            inputProps={{
                                                'aria-label': teamLabel(
                                                    row.team,
                                                    row.competitionMatchTeam,
                                                ),
                                            }}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="body2">
                                            {teamLabel(row.team, row.competitionMatchTeam)}
                                        </Typography>
                                        {context.length > 0 && (
                                            <Typography variant="caption" color="text.secondary">
                                                {context}
                                            </Typography>
                                        )}
                                    </TableCell>
                                    <TableCell sx={{fontVariantNumeric: 'tabular-nums'}}>
                                        {official?.startMillis !== undefined
                                            ? formatTimeOfDay(official.startMillis)
                                            : '–'}
                                    </TableCell>
                                    <TableCell sx={{fontVariantNumeric: 'tabular-nums'}}>
                                        {official?.finishMillis !== undefined
                                            ? formatTimeOfDay(official.finishMillis)
                                            : '–'}
                                    </TableCell>
                                    <TableCell sx={{fontVariantNumeric: 'tabular-nums'}}>
                                        {official?.computedMillis !== undefined
                                            ? formatDuration(official.computedMillis)
                                            : '–'}
                                    </TableCell>
                                    <TableCell sx={{fontVariantNumeric: 'tabular-nums'}}>
                                        {official?.overrideMillis !== undefined
                                            ? formatDuration(official.overrideMillis)
                                            : '–'}
                                    </TableCell>
                                    <TableCell sx={{fontVariantNumeric: 'tabular-nums'}}>
                                        {official !== undefined && official.penaltyMillis !== 0
                                            ? t('timing.leitstand.results.penaltyValue', {
                                                  seconds: formatSeconds(official.penaltyMillis),
                                              })
                                            : '–'}
                                    </TableCell>
                                    <TableCell>
                                        {official !== undefined && official.resultStatus !== 'NONE' ? (
                                            <Chip
                                                size="small"
                                                color="warning"
                                                label={t(
                                                    `timing.leitstand.results.status.${official.resultStatus}`,
                                                )}
                                            />
                                        ) : (
                                            <Typography variant="body2" color="text.secondary">
                                                –
                                            </Typography>
                                        )}
                                    </TableCell>
                                    <TableCell
                                        sx={{
                                            fontFamily: 'monospace',
                                            fontVariantNumeric: 'tabular-nums',
                                        }}>
                                        {official?.effectiveMillis !== undefined
                                            ? formatDuration(official.effectiveMillis)
                                            : '–'}
                                    </TableCell>
                                    <TableCell>
                                        <Stack direction="row" spacing={0.5} alignItems="center">
                                            {official?.pushedAt !== undefined && (
                                                <Typography variant="caption" color="text.secondary">
                                                    {format(
                                                        new Date(official.pushedAt),
                                                        t('format.datetime'),
                                                    )}
                                                </Typography>
                                            )}
                                            {official?.dirty === true && (
                                                <Tooltip title={t('timing.leitstand.results.dirtyHint')}>
                                                    <Chip
                                                        size="small"
                                                        color="warning"
                                                        label={t('timing.leitstand.results.dirty')}
                                                    />
                                                </Tooltip>
                                            )}
                                            {official?.pushedAt === undefined &&
                                                official?.dirty !== true && (
                                                    <Typography variant="caption" color="text.secondary">
                                                        {t('timing.leitstand.results.notPushed')}
                                                    </Typography>
                                                )}
                                        </Stack>
                                    </TableCell>
                                    <TableCell align="right">
                                        <Tooltip title={t('timing.leitstand.results.edit.action')}>
                                            <IconButton
                                                size="small"
                                                aria-label={t('timing.leitstand.results.edit.action')}
                                                onClick={() =>
                                                    setEditTeamId(row.competitionMatchTeam)
                                                }>
                                                <EditIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    </TableCell>
                                </TableRow>
                            )
                        })}
                        {rows.length === 0 && !officialTimesPending && (
                            <TableRow>
                                <TableCell colSpan={11}>
                                    <Typography variant="body2" color="text.secondary">
                                        {t('timing.leitstand.results.empty')}
                                    </Typography>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </Box>

            <Dialog
                open={computeResult !== null}
                onClose={() => setComputeResult(null)}
                fullWidth
                maxWidth="sm">
                <DialogTitle>{t('timing.leitstand.results.compute.resultTitle')}</DialogTitle>
                <DialogContent>
                    <DialogContentText sx={{mb: 2}}>
                        {t('timing.leitstand.results.compute.computedCount', {
                            count: computeResult?.computed ?? 0,
                        })}
                    </DialogContentText>
                    {(computeResult?.skipped.length ?? 0) === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                            {t('timing.leitstand.results.compute.noSkips')}
                        </Typography>
                    ) : (
                        <Stack spacing={0.5}>
                            <Typography variant="subtitle2">
                                {t('timing.leitstand.results.compute.skippedCount', {
                                    count: computeResult?.skipped.length ?? 0,
                                })}
                            </Typography>
                            {computeResult?.skipped.map(skip => (
                                <Typography key={skip.competitionMatchTeam} variant="body2">
                                    {teamLabel(
                                        teamById.get(skip.competitionMatchTeam),
                                        skip.competitionMatchTeam,
                                    )}
                                    {' — '}
                                    {t(`timing.leitstand.results.compute.skipReason.${skip.reason}`)}
                                </Typography>
                            ))}
                        </Stack>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setComputeResult(null)}>{t('common.close')}</Button>
                </DialogActions>
            </Dialog>

            <Dialog
                open={conflicts !== null}
                onClose={() => setConflicts(null)}
                fullWidth
                maxWidth="sm">
                <DialogTitle>{t('timing.leitstand.results.push.conflictTitle')}</DialogTitle>
                <DialogContent>
                    <DialogContentText sx={{mb: 2}}>
                        {t('timing.leitstand.results.push.conflictDescription')}
                    </DialogContentText>
                    <Stack spacing={0.5}>
                        {conflicts?.list.map(conflict => (
                            <Typography key={conflict.competitionMatchTeam} variant="body2">
                                {teamLabel(
                                    teamById.get(conflict.competitionMatchTeam),
                                    conflict.competitionMatchTeam,
                                )}
                                {' — '}
                                {t(`timing.leitstand.results.push.conflictReason.${conflict.reason}`)}
                            </Typography>
                        ))}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConflicts(null)} disabled={pushing}>
                        {t('common.close')}
                    </Button>
                    {forceable && (
                        <Button color="error" onClick={handleForcePush} disabled={pushing}>
                            {t('timing.leitstand.results.push.force')}
                        </Button>
                    )}
                </DialogActions>
            </Dialog>

            {editRow !== undefined && (
                <OfficialTimeEditDialog
                    open
                    onClose={() => setEditTeamId(null)}
                    eventId={eventId}
                    competitionMatchTeam={editRow.competitionMatchTeam}
                    teamLabel={teamLabel(editRow.team, editRow.competitionMatchTeam)}
                    official={editRow.official}
                    onSaved={reloadOfficialTimes}
                />
            )}
        </Stack>
    )
}

export default LeitstandResultsTab
