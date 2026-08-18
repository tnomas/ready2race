import {
    Alert,
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
import EditIcon from '@mui/icons-material/Edit'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import PublishIcon from '@mui/icons-material/Publish'
import {useCallback, useMemo, useState} from 'react'
import {useTranslation} from 'react-i18next'
import {Link} from '@tanstack/react-router'
import {pushTimingResults} from '@api/sdk.gen.ts'
import {
    TimingResultDto,
    TimingResultSkipDto,
    TimingResultSkipReason,
    TimingTeamDto,
} from '@api/types.gen.ts'
import {useConfirmation} from '@contexts/confirmation/ConfirmationContext.ts'
import {useFeedback} from '@utils/hooks.ts'
import Throbber from '@components/Throbber.tsx'
import TimingResultEntryDialog from '@components/timing/leitstand/TimingResultEntryDialog.tsx'
import {
    formatDuration,
    formatTimeOfDay,
    teamContextLabel,
    teamLabel,
} from '@components/timing/leitstand/format.ts'

export type LeitstandResultsTabProps = {
    eventId: string
    teams: TimingTeamDto[]
    results: TimingResultDto[]
    resultsPending: boolean
    reloadResults: () => void
}

/** The reasons a 409 push conflict can carry — the backend's `PushConflictReason`. */
type PushConflictReason = 'RESULT_FROZEN' | 'NO_FINAL_TIME' | 'WRONG_TIMING_SYSTEM'

type PushConflict = {
    competitionMatchTeam: string
    reason: PushConflictReason
}

const CONFLICT_REASONS: PushConflictReason[] = [
    'RESULT_FROZEN',
    'NO_FINAL_TIME',
    'WRONG_TIMING_SYSTEM',
]

/**
 * Read `details.conflicts` out of the backend's 409 body without trusting its shape.
 *
 * The generated error type for the push is the shared `ApiError`, whose `details` is untyped, so the
 * conflict list has to be narrowed by hand. Returns an empty array when the body doesn't carry a
 * usable conflict list, which the caller treats as "generic failure" rather than "no conflicts".
 */
function extractConflicts(error: unknown): PushConflict[] {
    if (typeof error !== 'object' || error === null) return []
    const details = (error as {details?: unknown}).details
    if (typeof details !== 'object' || details === null) return []
    const conflicts = (details as {conflicts?: unknown}).conflicts
    if (!Array.isArray(conflicts)) return []
    return conflicts.filter((entry): entry is PushConflict => {
        if (typeof entry !== 'object' || entry === null) return false
        const team = (entry as {competitionMatchTeam?: unknown}).competitionMatchTeam
        const reason = (entry as {reason?: unknown}).reason
        return (
            typeof team === 'string' &&
            typeof reason === 'string' &&
            (CONFLICT_REASONS as string[]).includes(reason)
        )
    })
}

type ResultRow = {
    competitionMatchTeam: string
    team: TimingTeamDto | undefined
    result: TimingResultDto | undefined
}

/**
 * The Leitstand's Ergebnisse tab: one row per team of the event, joined with the result the backend
 * derives from its marks.
 *
 * **Nothing shown here is stored except the judged part.** `startMillis`/`finishMillis` are resolved
 * live from the team's currently assigned, non-retracted marks, `measuredMillis` is their difference,
 * and `computedFinalMillis` is that plus the penalty. Only the penalty, its note and a DNS/DNF/DSQ
 * status are persisted — which is why there is no "recompute" button any more: a mark edit *is* the
 * recompute, and the websocket's `resultChanged` delivers the new row immediately.
 *
 * Rows are built from `teams` (not from `results`), so a team that has nothing captured yet is still
 * listed and can be given a penalty or a status before any time exists. A result without a matching
 * team — a team removed from the event after the fact — is appended rather than silently dropped,
 * identified by its raw id.
 *
 * **Push.** "Auswahl übernehmen" pushes the selected rows (the server then requires *every* named team
 * to be pushable and fails the whole call otherwise), "Alle übernehmen" pushes everything pushable and
 * reports the rest as `skipped` — a half-timed event is the normal state of a running regatta, so the
 * all-variant must not refuse the batch over boats still on the water. A 409 lists the conflicting
 * teams: `RESULT_FROZEN` can be forced through after an explicit confirmation, while `NO_FINAL_TIME`
 * (nothing to write) and `WRONG_TIMING_SYSTEM` (the competition is timed elsewhere — forcing would
 * overwrite what its real timing source produced) cannot.
 *
 * Full manual overrides — a time typed in by hand, a place — deliberately do **not** live here: they
 * belong to the competition execution view, which this tab links to.
 */
const LeitstandResultsTab = ({
    eventId,
    teams,
    results,
    resultsPending,
    reloadResults,
}: LeitstandResultsTabProps) => {
    const {t} = useTranslation()
    const feedback = useFeedback()
    const {confirmAction} = useConfirmation()

    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [pushing, setPushing] = useState(false)
    const [editTeamId, setEditTeamId] = useState<string | null>(null)
    const [skipped, setSkipped] = useState<TimingResultSkipDto[] | null>(null)
    const [conflicts, setConflicts] = useState<PushConflict[] | null>(null)

    const resultByTeam = useMemo(
        () => new Map(results.map(entry => [entry.competitionMatchTeam, entry])),
        [results],
    )

    const rows: ResultRow[] = useMemo(() => {
        const known = new Set(teams.map(team => team.competitionMatchTeam))
        const fromTeams = teams.map(team => ({
            competitionMatchTeam: team.competitionMatchTeam,
            team,
            result: resultByTeam.get(team.competitionMatchTeam),
        }))
        const orphaned = results
            .filter(entry => !known.has(entry.competitionMatchTeam))
            .map(entry => ({
                competitionMatchTeam: entry.competitionMatchTeam,
                team: undefined,
                result: entry,
            }))
        return [...fromTeams, ...orphaned]
    }, [teams, results, resultByTeam])

    /** A row can be pushed once it has either a final time or a status — exactly the server's rule. */
    const isPushable = useCallback((result: TimingResultDto | undefined): boolean => {
        if (result === undefined) return false
        return result.computedFinalMillis != null || result.resultStatus !== 'NONE'
    }, [])

    const pushableCount = useMemo(
        () => rows.filter(row => isPushable(row.result)).length,
        [rows, isPushable],
    )

    const toggle = (competitionMatchTeam: string) => {
        setSelected(prev => {
            const next = new Set(prev)
            if (next.has(competitionMatchTeam)) next.delete(competitionMatchTeam)
            else next.add(competitionMatchTeam)
            return next
        })
    }

    const runPush = useCallback(
        (teamIds: string[] | undefined, force: boolean) => {
            setPushing(true)
            void (async () => {
                try {
                    const {data, error} = await pushTimingResults({
                        path: {eventId},
                        body: {teams: teamIds ?? null, force},
                    })
                    if (error !== undefined) {
                        const found = extractConflicts(error)
                        if (found.length > 0) {
                            setConflicts(found)
                        } else {
                            feedback.error(t('timing.leitstand.results.push.error'))
                        }
                        return
                    }
                    if (data === undefined) {
                        feedback.error(t('timing.leitstand.results.push.error'))
                        return
                    }
                    feedback.success(
                        t('timing.leitstand.results.push.success', {count: data.pushed.length}),
                    )
                    // Reported rather than swallowed: a team left out of a push-all is exactly the
                    // thing an operator needs to go and fix on the Zeiten tab.
                    setSkipped(data.skipped.length > 0 ? data.skipped : null)
                    setSelected(new Set())
                    reloadResults()
                } catch {
                    feedback.error(t('common.error.unexpected'))
                } finally {
                    setPushing(false)
                }
            })()
        },
        [eventId, feedback, t, reloadResults],
    )

    const pushSelected = () => {
        const ids = [...selected]
        if (ids.length === 0) return
        runPush(ids, false)
    }

    const pushAll = () => {
        if (pushableCount === 0) {
            feedback.warning(t('timing.leitstand.results.push.nothing'))
            return
        }
        confirmAction(() => runPush(undefined, false), {
            title: t('timing.leitstand.results.push.confirmAll.title'),
            content: t('timing.leitstand.results.push.confirmAll.content'),
            okText: t('timing.leitstand.results.push.all'),
        })
    }

    /**
     * Offered only when *every* conflict is a freeze: `force` overrides that and nothing else, so a
     * batch that also contains a team without a final time (or one timed elsewhere) can never be
     * pushed through, no matter how often the operator confirms.
     */
    const forcableConflicts = useMemo(
        () => (conflicts ?? []).filter(conflict => conflict.reason === 'RESULT_FROZEN'),
        [conflicts],
    )
    const canForce =
        conflicts !== null && conflicts.length > 0 && forcableConflicts.length === conflicts.length

    const forcePush = () => {
        const ids = conflicts?.map(conflict => conflict.competitionMatchTeam) ?? []
        setConflicts(null)
        confirmAction(() => runPush(ids, true), {
            title: t('timing.leitstand.results.push.forceConfirm.title'),
            content: t('timing.leitstand.results.push.forceConfirm.content', {count: ids.length}),
            okText: t('timing.leitstand.results.push.force'),
        })
    }

    const editRow = rows.find(row => row.competitionMatchTeam === editTeamId)

    const skipReasonLabel = (reason: TimingResultSkipReason) =>
        t(`timing.leitstand.results.skipReason.${reason}`)

    if (resultsPending && results.length === 0) {
        return <Throbber />
    }

    return (
        <Stack spacing={2}>
            <Stack
                direction="row"
                spacing={2}
                alignItems="center"
                flexWrap="wrap"
                useFlexGap
                sx={{rowGap: 1}}>
                <Button
                    variant="contained"
                    startIcon={<PublishIcon />}
                    disabled={pushing || selected.size === 0}
                    onClick={pushSelected}>
                    {t('timing.leitstand.results.push.selected')}
                </Button>
                <Button
                    variant="outlined"
                    startIcon={<PublishIcon />}
                    disabled={pushing}
                    onClick={pushAll}>
                    {t('timing.leitstand.results.push.all')}
                </Button>
                <Typography variant="body2" color="text.secondary">
                    {selected.size > 0
                        ? t('timing.leitstand.results.selectedCount', {count: selected.size})
                        : t('timing.leitstand.results.pushableCount', {count: pushableCount})}
                </Typography>
                <Box sx={{flexGrow: 1}} />
                {/* Kein Zeilen-Deeplink: Eine Ergebniszeile kennt nur ihren Lauf, nicht den
                    Wettkampf, und den Weg dorthin über den Lauf zu raten wäre eine Falle. Der
                    Verweis führt deshalb auf die Wettkampfliste der Veranstaltung. */}
                <Link
                    to={'/event/$eventId'}
                    params={{eventId}}
                    search={{tab: 'competitions'}}
                    target="_blank"
                    style={{textDecoration: 'none'}}>
                    <Button size="small" endIcon={<OpenInNewIcon />}>
                        {t('timing.leitstand.results.execution.link')}
                    </Button>
                </Link>
            </Stack>
            <Alert severity="info">{t('timing.leitstand.results.execution.hint')}</Alert>

            {rows.length === 0 ? (
                <Typography color="text.secondary">
                    {t('timing.leitstand.results.empty')}
                </Typography>
            ) : (
                <Box sx={{overflowX: 'auto'}}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell padding="checkbox" />
                                <TableCell>{t('timing.leitstand.results.column.team')}</TableCell>
                                <TableCell>{t('timing.leitstand.results.column.start')}</TableCell>
                                <TableCell>{t('timing.leitstand.results.column.finish')}</TableCell>
                                <TableCell>
                                    {t('timing.leitstand.results.column.measured')}
                                </TableCell>
                                <TableCell>
                                    {t('timing.leitstand.results.column.penalty')}
                                </TableCell>
                                <TableCell>{t('timing.leitstand.results.column.status')}</TableCell>
                                <TableCell>
                                    {t('timing.leitstand.results.column.computed')}
                                </TableCell>
                                <TableCell>{t('timing.leitstand.results.column.pushed')}</TableCell>
                                <TableCell align="right">
                                    {t('timing.leitstand.results.column.actions')}
                                </TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {rows.map(row => {
                                const result = row.result
                                const context = teamContextLabel(row.team)
                                return (
                                    <TableRow key={row.competitionMatchTeam} hover>
                                        <TableCell padding="checkbox">
                                            <Checkbox
                                                checked={selected.has(row.competitionMatchTeam)}
                                                onChange={() => toggle(row.competitionMatchTeam)}
                                                disabled={!isPushable(result)}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Stack>
                                                <Typography variant="body2">
                                                    {teamLabel(row.team, row.competitionMatchTeam)}
                                                </Typography>
                                                {context.length > 0 && (
                                                    <Typography
                                                        variant="caption"
                                                        color="text.secondary">
                                                        {context}
                                                    </Typography>
                                                )}
                                            </Stack>
                                        </TableCell>
                                        <TableCell sx={{fontFamily: 'monospace'}}>
                                            {result?.startMillis != null
                                                ? formatTimeOfDay(result.startMillis)
                                                : '–'}
                                        </TableCell>
                                        <TableCell sx={{fontFamily: 'monospace'}}>
                                            {result?.finishMillis != null
                                                ? formatTimeOfDay(result.finishMillis)
                                                : '–'}
                                        </TableCell>
                                        <TableCell sx={{fontFamily: 'monospace'}}>
                                            {result?.measuredMillis != null
                                                ? formatDuration(result.measuredMillis)
                                                : '–'}
                                        </TableCell>
                                        <TableCell>
                                            {result?.penaltySeconds != null &&
                                            result.penaltySeconds !== 0 ? (
                                                <Tooltip title={result.penaltyNote ?? ''}>
                                                    <Chip
                                                        size="small"
                                                        color="warning"
                                                        label={t(
                                                            'timing.leitstand.results.penaltyValue',
                                                            {seconds: result.penaltySeconds},
                                                        )}
                                                    />
                                                </Tooltip>
                                            ) : (
                                                '–'
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {result !== undefined &&
                                            result.resultStatus !== 'NONE' ? (
                                                <Chip
                                                    size="small"
                                                    color="error"
                                                    label={t(
                                                        `timing.leitstand.results.status.${result.resultStatus}`,
                                                    )}
                                                />
                                            ) : (
                                                '–'
                                            )}
                                        </TableCell>
                                        <TableCell sx={{fontFamily: 'monospace'}}>
                                            {result?.computedFinalMillis != null ? (
                                                formatDuration(result.computedFinalMillis)
                                            ) : result?.skipReason != null ? (
                                                <Typography
                                                    variant="caption"
                                                    color="text.secondary">
                                                    {skipReasonLabel(result.skipReason)}
                                                </Typography>
                                            ) : (
                                                '–'
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Stack direction="row" spacing={0.5}>
                                                <Chip
                                                    size="small"
                                                    color={
                                                        result?.pushed === true
                                                            ? 'success'
                                                            : 'default'
                                                    }
                                                    label={
                                                        result?.pushed === true
                                                            ? t('timing.leitstand.results.isPushed')
                                                            : t(
                                                                  'timing.leitstand.results.notPushed',
                                                              )
                                                    }
                                                />
                                                {result?.frozen === true && (
                                                    <Tooltip
                                                        title={t(
                                                            'timing.leitstand.results.frozenHint',
                                                        )}>
                                                        <Chip
                                                            size="small"
                                                            color="warning"
                                                            variant="outlined"
                                                            label={t(
                                                                'timing.leitstand.results.frozen',
                                                            )}
                                                        />
                                                    </Tooltip>
                                                )}
                                            </Stack>
                                        </TableCell>
                                        <TableCell align="right">
                                            <Tooltip
                                                title={t('timing.leitstand.results.entry.action')}>
                                                <IconButton
                                                    size="small"
                                                    aria-label={t(
                                                        'timing.leitstand.results.entry.action',
                                                    )}
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
                        </TableBody>
                    </Table>
                </Box>
            )}

            {editRow !== undefined && (
                <TimingResultEntryDialog
                    open
                    onClose={() => setEditTeamId(null)}
                    eventId={eventId}
                    competitionMatchTeam={editRow.competitionMatchTeam}
                    teamLabel={teamLabel(editRow.team, editRow.competitionMatchTeam)}
                    result={editRow.result}
                    onSaved={reloadResults}
                />
            )}

            <Dialog
                open={skipped !== null}
                onClose={() => setSkipped(null)}
                fullWidth
                maxWidth="sm">
                <DialogTitle>{t('timing.leitstand.results.push.skippedTitle')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {t('timing.leitstand.results.push.skippedDescription')}
                    </DialogContentText>
                    <Stack spacing={0.5} sx={{mt: 2}}>
                        {(skipped ?? []).map(entry => (
                            <Typography key={entry.competitionMatchTeam} variant="body2">
                                {teamLabel(
                                    teams.find(
                                        team =>
                                            team.competitionMatchTeam ===
                                            entry.competitionMatchTeam,
                                    ),
                                    entry.competitionMatchTeam,
                                )}{' '}
                                — {skipReasonLabel(entry.reason)}
                            </Typography>
                        ))}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setSkipped(null)}>{t('common.close')}</Button>
                </DialogActions>
            </Dialog>

            <Dialog
                open={conflicts !== null}
                onClose={() => setConflicts(null)}
                fullWidth
                maxWidth="sm">
                <DialogTitle>{t('timing.leitstand.results.push.conflictTitle')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {t('timing.leitstand.results.push.conflictDescription')}
                    </DialogContentText>
                    <Stack spacing={0.5} sx={{mt: 2}}>
                        {(conflicts ?? []).map(conflict => (
                            <Typography key={conflict.competitionMatchTeam} variant="body2">
                                {teamLabel(
                                    teams.find(
                                        team =>
                                            team.competitionMatchTeam ===
                                            conflict.competitionMatchTeam,
                                    ),
                                    conflict.competitionMatchTeam,
                                )}{' '}
                                — {t(`timing.leitstand.results.conflictReason.${conflict.reason}`)}
                            </Typography>
                        ))}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    {canForce && (
                        <Button color="warning" onClick={forcePush}>
                            {t('timing.leitstand.results.push.force')}
                        </Button>
                    )}
                    <Button onClick={() => setConflicts(null)}>{t('common.close')}</Button>
                </DialogActions>
            </Dialog>
        </Stack>
    )
}

export default LeitstandResultsTab
