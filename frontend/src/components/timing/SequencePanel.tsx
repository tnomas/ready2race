import {ReactNode, useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {
    Alert,
    Box,
    Button,
    Checkbox,
    Chip,
    Divider,
    FormControlLabel,
    IconButton,
    Stack,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import CancelIcon from '@mui/icons-material/Cancel'
import SkipNextIcon from '@mui/icons-material/SkipNext'
import ReplayIcon from '@mui/icons-material/Replay'
import {useTranslation} from 'react-i18next'
import {useConfirmation} from '@contexts/confirmation/ConfirmationContext.ts'
import {useFeedback} from '@utils/hooks.ts'
import Throbber from '@components/Throbber.tsx'
import {
    SequenceMode,
    TimingSequenceDto,
    TimingSequenceEntryDto,
    TimingTeamDto,
} from '@api/types.gen.ts'
import {UseSequenceResult} from '@utils/timing/useSequence.ts'
import {playCountdownBeep, unlockAudio} from '@utils/timing/feedback.ts'

export type SequencePanelProps = {
    stationId: string
    teams: TimingTeamDto[]
    teamsLoading: boolean
    now: () => number | null
    sequenceState: UseSequenceResult
}

const DEFAULT_INTERVAL_SECONDS = 60
/** Matches the backend's MASS default (`SequenceService`), and the initial value shown for MASS. */
const DEFAULT_LEAD_IN_SECONDS = 10
/** Server-side bounds for `leadInMillis` — validated here too so the request isn't wasted. */
const LEAD_IN_MIN_SECONDS = 3
const LEAD_IN_MAX_SECONDS = 600

/** Short human label for a team: `#12 · Team Name`, falling back to whatever is available. */
function teamLabel(team: TimingTeamDto | undefined, fallbackId: string): string {
    if (team === undefined) return fallbackId
    const bits: string[] = []
    if (team.startNumber != null) bits.push(`#${team.startNumber}`)
    if (team.teamName) bits.push(team.teamName)
    else if (team.clubName) bits.push(team.clubName)
    else if (team.participantNames.length > 0) bits.push(team.participantNames.join(' / '))
    return bits.length > 0 ? bits.join(' · ') : fallbackId
}

/** Wall-clock time at 1s precision, e.g. for a fired entry's planned/actual start. */
function formatTimeOfDay(ms: number): string {
    const date = new Date(ms)
    const hh = String(date.getHours()).padStart(2, '0')
    const mm = String(date.getMinutes()).padStart(2, '0')
    const ss = String(date.getSeconds()).padStart(2, '0')
    return `${hh}:${mm}:${ss}`
}

function formatCountdown(remainingMillis: number): string {
    const totalSeconds = Math.max(0, Math.ceil(remainingMillis / 1000))
    const mm = Math.floor(totalSeconds / 60)
    const ss = totalSeconds % 60
    return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

const COUNTDOWN_PLACEHOLDER = '--:--'

/**
 * How far past T-0 the countdown keeps showing `00:00` before it switches to the "in progress" label.
 * A small grace window is deliberate: the scheduler fires within a tick or so of T-0, and a display
 * that flips the instant the target passes would flicker on every start. Past that, a frozen `00:00`
 * would be a lie — the start already happened (or the scheduler is late) — so say so instead.
 */
const OVERDUE_GRACE_MILLIS = 2000

/**
 * Big rAF-driven countdown to `targetMillis`, written directly into a ref'd element's `textContent`
 * (like `BoardHeader`'s clock) so the rest of the panel doesn't re-render every frame. Also fires the
 * countdown beeps (`playCountdownBeep`) at T-5..T-1 (short) and T-0 (long/final), guarding against
 * repeats within the same second via `lastBeepedSecondRef`. Resets that guard whenever `targetMillis`
 * changes (INTERVAL mode moves the target to the next entry once the current one fires).
 *
 * Once the target is more than `OVERDUE_GRACE_MILLIS` in the past it renders `overdueLabel` with a
 * pulse (`data-overdue`) instead of a stuck `00:00`.
 */
const RunningCountdown = ({
    targetMillis,
    now,
    overdueLabel,
}: {
    targetMillis: number
    now: () => number | null
    overdueLabel: string
}) => {
    const textRef = useRef<HTMLSpanElement | null>(null)
    const nowRef = useRef(now)
    const overdueLabelRef = useRef(overdueLabel)
    const lastBeepedSecondRef = useRef<number>(Number.NaN)

    useEffect(() => {
        nowRef.current = now
        overdueLabelRef.current = overdueLabel
    })

    useEffect(() => {
        lastBeepedSecondRef.current = Number.NaN
        let rafId: number

        const tick = () => {
            const current = nowRef.current()
            const element = textRef.current
            if (current !== null && element) {
                const remaining = targetMillis - current
                const overdue = remaining < -OVERDUE_GRACE_MILLIS
                const text = overdue ? overdueLabelRef.current : formatCountdown(remaining)
                if (element.textContent !== text) element.textContent = text
                const overdueFlag = overdue ? 'true' : 'false'
                if (element.dataset.overdue !== overdueFlag) element.dataset.overdue = overdueFlag

                const secondsRemaining = Math.ceil(remaining / 1000)
                if (secondsRemaining !== lastBeepedSecondRef.current) {
                    lastBeepedSecondRef.current = secondsRemaining
                    if (secondsRemaining >= 1 && secondsRemaining <= 5) {
                        playCountdownBeep(false)
                    } else if (secondsRemaining === 0) {
                        playCountdownBeep(true)
                    }
                }
            }
            rafId = requestAnimationFrame(tick)
        }

        rafId = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(rafId)
    }, [targetMillis])

    return (
        <Typography
            ref={textRef}
            component="span"
            variant="h1"
            sx={{
                fontFamily: 'monospace',
                fontVariantNumeric: 'tabular-nums',
                fontWeight: 700,
                '@keyframes sequenceOverduePulse': {
                    '0%': {opacity: 1},
                    '50%': {opacity: 0.4},
                    '100%': {opacity: 1},
                },
                '&[data-overdue="true"]': {
                    fontSize: '2.5rem',
                    animation: 'sequenceOverduePulse 1.2s ease-in-out infinite',
                },
            }}>
            {COUNTDOWN_PLACEHOLDER}
        </Typography>
    )
}

export type CreateSequenceParams = {
    mode: SequenceMode
    intervalMillis: number | undefined
    leadInMillis: number
    teams: string[]
}

type SetupFormProps = {
    /** Event teams, already in start-number order — the armed order is exactly this order. */
    teams: TimingTeamDto[]
    teamsLoading: boolean
    busy: boolean
    onCreate: (params: CreateSequenceParams) => void
}

/**
 * Setup form: mode toggle, interval field (INTERVAL only), lead-in field, and a checkbox list of the
 * event's teams (select-all on top, all selected by default). The armed order is the start-number
 * order the list is rendered in — reordering by hand is a deliberate v1 cut (see the Task C report).
 *
 * The two number fields are kept as *strings* so they may be transiently empty while typing (snapping
 * an empty field to a minimum makes it impossible to replace "60" with "5"); they are validated when
 * the operator submits.
 */
const SetupForm = ({teams, teamsLoading, busy, onCreate}: SetupFormProps) => {
    const {t} = useTranslation()

    const [mode, setMode] = useState<SequenceMode>('MASS')
    const [intervalInput, setIntervalInput] = useState(String(DEFAULT_INTERVAL_SECONDS))
    const [leadInInput, setLeadInInput] = useState(String(DEFAULT_LEAD_IN_SECONDS))
    /**
     * Until the operator types their own lead-in, the field mirrors the backend's defaults: the
     * interval for INTERVAL mode (so the first start gets the same gap as every following one) and
     * 10s for MASS. Once edited, the value is theirs and nothing overwrites it again.
     */
    const [leadInEdited, setLeadInEdited] = useState(false)
    const [invalidField, setInvalidField] = useState<'interval' | 'leadIn' | 'teams' | undefined>(
        undefined,
    )

    const [selected, setSelected] = useState<Set<string>>(new Set())
    // Teams load asynchronously, so the default "all selected" has to be (re-)applied whenever the
    // roster itself changes rather than only on mount.
    useEffect(() => {
        setSelected(new Set(teams.map(team => team.competitionMatchTeam)))
    }, [teams])

    const handleModeChange = (next: SequenceMode) => {
        setMode(next)
        if (!leadInEdited) {
            setLeadInInput(next === 'INTERVAL' ? intervalInput : String(DEFAULT_LEAD_IN_SECONDS))
        }
    }

    const handleIntervalChange = (value: string) => {
        setIntervalInput(value)
        if (!leadInEdited && mode === 'INTERVAL') setLeadInInput(value)
    }

    const handleLeadInChange = (value: string) => {
        setLeadInEdited(true)
        setLeadInInput(value)
    }

    const toggleTeam = (id: string) => {
        setSelected(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const allSelected = teams.length > 0 && selected.size === teams.length
    const someSelected = selected.size > 0 && !allSelected

    const toggleAll = () => {
        setSelected(allSelected ? new Set() : new Set(teams.map(team => team.competitionMatchTeam)))
    }

    const handleSubmit = () => {
        const intervalSeconds = Number(intervalInput)
        if (
            mode === 'INTERVAL' &&
            (!Number.isFinite(intervalSeconds) || Math.floor(intervalSeconds) < 1)
        ) {
            setInvalidField('interval')
            return
        }
        const leadInSeconds = Number(leadInInput)
        if (
            !Number.isFinite(leadInSeconds) ||
            leadInSeconds < LEAD_IN_MIN_SECONDS ||
            leadInSeconds > LEAD_IN_MAX_SECONDS
        ) {
            setInvalidField('leadIn')
            return
        }
        const selectedTeams = teams
            .filter(team => selected.has(team.competitionMatchTeam))
            .map(team => team.competitionMatchTeam)
        if (selectedTeams.length === 0) {
            setInvalidField('teams')
            return
        }
        setInvalidField(undefined)
        onCreate({
            mode,
            intervalMillis: mode === 'INTERVAL' ? Math.floor(intervalSeconds) * 1000 : undefined,
            leadInMillis: Math.round(leadInSeconds * 1000),
            teams: selectedTeams,
        })
    }

    return (
        <Stack sx={{flexGrow: 1, width: 1, maxWidth: 480, mx: 'auto'}} spacing={2}>
            <Typography variant="h5" textAlign="center">
                {t('timing.sequence.setup.title')}
            </Typography>
            <ToggleButtonGroup
                value={mode}
                exclusive
                fullWidth
                onChange={(_, value: SequenceMode | null) => {
                    if (value !== null) handleModeChange(value)
                }}>
                <ToggleButton value="MASS">{t('timing.sequence.mode.MASS')}</ToggleButton>
                <ToggleButton value="INTERVAL">{t('timing.sequence.mode.INTERVAL')}</ToggleButton>
            </ToggleButtonGroup>
            {mode === 'INTERVAL' && (
                <TextField
                    type="number"
                    label={t('timing.sequence.setup.intervalSeconds')}
                    value={intervalInput}
                    onChange={event => handleIntervalChange(event.target.value)}
                    error={invalidField === 'interval'}
                    helperText={
                        invalidField === 'interval'
                            ? t('timing.sequence.error.invalidInterval')
                            : undefined
                    }
                    slotProps={{htmlInput: {min: 1}}}
                    fullWidth
                />
            )}
            <TextField
                type="number"
                label={t('timing.sequence.setup.leadInSeconds')}
                value={leadInInput}
                onChange={event => handleLeadInChange(event.target.value)}
                error={invalidField === 'leadIn'}
                helperText={
                    invalidField === 'leadIn'
                        ? t('timing.sequence.error.invalidLeadIn', {
                              min: LEAD_IN_MIN_SECONDS,
                              max: LEAD_IN_MAX_SECONDS,
                          })
                        : t('timing.sequence.setup.leadInHelp', {
                              min: LEAD_IN_MIN_SECONDS,
                              max: LEAD_IN_MAX_SECONDS,
                          })
                }
                slotProps={{htmlInput: {min: LEAD_IN_MIN_SECONDS, max: LEAD_IN_MAX_SECONDS}}}
                fullWidth
            />
            <Divider />
            <Stack direction="row" alignItems="center" justifyContent="space-between">
                <FormControlLabel
                    control={
                        <Checkbox
                            checked={allSelected}
                            indeterminate={someSelected}
                            disabled={teams.length === 0}
                            onChange={toggleAll}
                        />
                    }
                    label={t('common.selectAll')}
                />
                <Typography variant="caption" color="text.secondary">
                    {t('timing.sequence.setup.selectedCount', {
                        selected: selected.size,
                        total: teams.length,
                    })}
                </Typography>
            </Stack>
            <Typography variant="caption" color="text.secondary">
                {t('timing.sequence.setup.orderHint')}
            </Typography>
            {teamsLoading ? (
                <Throbber />
            ) : (
                <Stack sx={{maxHeight: 280, overflowY: 'auto'}}>
                    {teams.map(team => (
                        <FormControlLabel
                            key={team.competitionMatchTeam}
                            control={
                                <Checkbox
                                    checked={selected.has(team.competitionMatchTeam)}
                                    onChange={() => toggleTeam(team.competitionMatchTeam)}
                                />
                            }
                            label={teamLabel(team, team.competitionMatchTeam)}
                        />
                    ))}
                </Stack>
            )}
            {invalidField === 'teams' && (
                <Alert severity="warning">{t('timing.sequence.error.noTeams')}</Alert>
            )}
            <Button
                variant="contained"
                size="large"
                disabled={busy || teamsLoading || teams.length === 0}
                onClick={handleSubmit}>
                {t('timing.sequence.setup.armButton')}
            </Button>
        </Stack>
    )
}

type EntryRowProps = {
    entry: TimingSequenceEntryDto
    label: string
    skippable: boolean
    busy: boolean
    onSkip: (entryId: string, teamLabel: string) => void
}

const EntryRow = ({entry, label, skippable, busy, onSkip}: EntryRowProps) => {
    const {t} = useTranslation()
    return (
        <Stack direction="row" alignItems="center" spacing={1} sx={{py: 0.5}}>
            <Typography
                variant="body2"
                color="text.secondary"
                sx={{width: 32, flexShrink: 0, fontVariantNumeric: 'tabular-nums'}}>
                {entry.position + 1}.
            </Typography>
            <Typography
                variant="body1"
                noWrap
                sx={{
                    flexGrow: 1,
                    textDecoration: entry.status === 'SKIPPED' ? 'line-through' : undefined,
                    color: entry.status === 'SKIPPED' ? 'text.disabled' : undefined,
                }}>
                {label}
            </Typography>
            {/* `plannedStartMillis` *is* the mark time for a fired entry, by design: the backend writes
                the planned instant as the time mark rather than the moment its scheduler happened to
                wake up, so every start of a sequence is exactly on the announced grid. Showing the
                planned value here is therefore showing the recorded start, not an estimate of it. */}
            {entry.status === 'STARTED' && entry.plannedStartMillis != null && (
                <Chip
                    size="small"
                    color="success"
                    label={formatTimeOfDay(entry.plannedStartMillis)}
                    sx={{fontFamily: 'monospace'}}
                />
            )}
            {entry.status === 'SKIPPED' && (
                <Chip size="small" label={t('timing.sequence.entry.skipped')} />
            )}
            {entry.status === 'PENDING' && skippable && (
                <IconButton
                    size="small"
                    aria-label={t('timing.sequence.entry.skip')}
                    disabled={busy}
                    onClick={() => onSkip(entry.id, label)}>
                    <SkipNextIcon fontSize="small" />
                </IconButton>
            )}
        </Stack>
    )
}

type ArmedViewProps = {
    sequence: TimingSequenceDto
    label: (id: string) => string
    busy: boolean
    onStart: () => void
    onAbort: () => void
    onSkip: (entryId: string, teamLabel: string) => void
}

const ArmedView = ({sequence, label, busy, onStart, onAbort, onSkip}: ArmedViewProps) => {
    const {t} = useTranslation()
    const entries = useMemo(
        () => [...sequence.entries].sort((a, b) => a.position - b.position),
        [sequence.entries],
    )

    return (
        <Stack sx={{flexGrow: 1, width: 1, minHeight: 'min-content'}} spacing={2}>
            <Typography variant="h5" textAlign="center">
                {t('timing.sequence.armed.title')}
            </Typography>
            <Stack sx={{flexGrow: 1, minHeight: 0, overflowY: 'auto'}} divider={<Divider />}>
                {entries.map(entry => (
                    <EntryRow
                        key={entry.id}
                        entry={entry}
                        label={label(entry.competitionMatchTeam)}
                        skippable
                        busy={busy}
                        onSkip={onSkip}
                    />
                ))}
            </Stack>
            <Button
                variant="contained"
                size="large"
                startIcon={<PlayArrowIcon />}
                disabled={busy}
                onClick={onStart}>
                {t('timing.sequence.armed.start')}
            </Button>
            <Button color="error" startIcon={<CancelIcon />} disabled={busy} onClick={onAbort}>
                {t('timing.sequence.abort')}
            </Button>
        </Stack>
    )
}

type RunningViewProps = {
    sequence: TimingSequenceDto
    label: (id: string) => string
    now: () => number | null
    busy: boolean
    onAbort: () => void
    onSkip: (entryId: string, teamLabel: string) => void
}

const RunningView = ({sequence, label, now, busy, onAbort, onSkip}: RunningViewProps) => {
    const {t} = useTranslation()
    const entries = useMemo(
        () => [...sequence.entries].sort((a, b) => a.position - b.position),
        [sequence.entries],
    )
    const pending = entries.filter(entry => entry.status === 'PENDING')
    const next = pending[0]
    const following = pending.slice(1)
    const settled = entries.filter(entry => entry.status !== 'PENDING')

    const targetMillis = next?.plannedStartMillis ?? sequence.startedAtMillis ?? undefined

    return (
        <Stack
            sx={{flexGrow: 1, width: 1, minHeight: 'min-content'}}
            spacing={2}
            alignItems="center">
            {next === undefined ? (
                <Typography variant="h5">{t('timing.sequence.running.finishing')}</Typography>
            ) : (
                <>
                    {targetMillis != null && (
                        <RunningCountdown
                            targetMillis={targetMillis}
                            now={now}
                            overdueLabel={t('timing.sequence.running.overdue')}
                        />
                    )}
                    <Typography variant="h4" textAlign="center" noWrap sx={{maxWidth: 1}}>
                        {label(next.competitionMatchTeam)}
                    </Typography>
                </>
            )}
            <Stack sx={{width: 1, flexGrow: 1, minHeight: 0, overflowY: 'auto'}} spacing={1}>
                {following.length > 0 && (
                    <Typography variant="caption" color="text.secondary">
                        {t('timing.sequence.running.following')}
                    </Typography>
                )}
                <Stack divider={<Divider />}>
                    {following.map(entry => (
                        <EntryRow
                            key={entry.id}
                            entry={entry}
                            label={label(entry.competitionMatchTeam)}
                            skippable
                            busy={busy}
                            onSkip={onSkip}
                        />
                    ))}
                </Stack>
                {settled.length > 0 && (
                    <Stack divider={<Divider />} sx={{opacity: 0.7}}>
                        {settled.map(entry => (
                            <EntryRow
                                key={entry.id}
                                entry={entry}
                                label={label(entry.competitionMatchTeam)}
                                skippable={false}
                                busy={busy}
                                onSkip={onSkip}
                            />
                        ))}
                    </Stack>
                )}
            </Stack>
            {next !== undefined && (
                <Button
                    size="small"
                    startIcon={<SkipNextIcon />}
                    disabled={busy}
                    onClick={() => onSkip(next.id, label(next.competitionMatchTeam))}>
                    {t('timing.sequence.entry.skip')}
                </Button>
            )}
            <Button
                color="error"
                startIcon={<CancelIcon />}
                disabled={busy}
                onClick={onAbort}
                fullWidth>
                {t('timing.sequence.abort')}
            </Button>
        </Stack>
    )
}

type SummaryViewProps = {
    sequence: TimingSequenceDto
    label: (id: string) => string
    onReset: () => void
}

const SummaryView = ({sequence, label, onReset}: SummaryViewProps) => {
    const {t} = useTranslation()
    const entries = useMemo(
        () => [...sequence.entries].sort((a, b) => a.position - b.position),
        [sequence.entries],
    )

    return (
        <Stack sx={{flexGrow: 1, width: 1, minHeight: 'min-content'}} spacing={2}>
            <Alert severity={sequence.state === 'DONE' ? 'success' : 'warning'}>
                {sequence.state === 'DONE'
                    ? t('timing.sequence.summary.titleDone')
                    : t('timing.sequence.summary.titleAborted')}
            </Alert>
            <Stack sx={{flexGrow: 1, minHeight: 0, overflowY: 'auto'}} divider={<Divider />}>
                {entries.map(entry => (
                    <EntryRow
                        key={entry.id}
                        entry={entry}
                        label={label(entry.competitionMatchTeam)}
                        skippable={false}
                        busy={false}
                        onSkip={() => {}}
                    />
                ))}
            </Stack>
            <Button variant="contained" startIcon={<ReplayIcon />} onClick={onReset}>
                {t('timing.sequence.summary.reset')}
            </Button>
        </Stack>
    )
}

/**
 * Start-sequence board panel for `station.type === 'START'`. Dispatches on `sequenceState.sequence`
 * (none/ARMED/RUNNING/DONE/ABORTED) to the corresponding view — see the plan
 * (`docs/superpowers/plans/2026-08-18-timing-start-sequences.md`, Task C) for the state machine.
 * Rendered above a smaller manual `CaptureButton` fallback by `TimingBoardPage`.
 *
 * The root carries `data-sequence-panel` (so the board's space-bar capture shortcut can tell that a
 * button inside this panel has focus and stand down) and unlocks the WebAudio context on any pointer
 * gesture, so a device that only *watches* a sequence still beeps along with the countdown.
 */
const SequencePanel = ({
    stationId,
    teams,
    teamsLoading,
    now,
    sequenceState,
}: SequencePanelProps) => {
    const {t} = useTranslation()
    const {confirmAction} = useConfirmation()
    const feedback = useFeedback()
    const {sequence, loading, error, busy, refetch, create, start, abort, skip, reset} =
        sequenceState

    const teamsById = useMemo(() => {
        const map = new Map<string, TimingTeamDto>()
        teams.forEach(team => map.set(team.competitionMatchTeam, team))
        return map
    }, [teams])

    const label = useCallback((id: string) => teamLabel(teamsById.get(id), id), [teamsById])

    /** The armed order: start number ascending, teams without one last. */
    const orderedTeams = useMemo(
        () => [...teams].sort((a, b) => (a.startNumber ?? Infinity) - (b.startNumber ?? Infinity)),
        [teams],
    )

    const handleCreate = useCallback(
        (params: CreateSequenceParams) => {
            void create({
                station: stationId,
                mode: params.mode,
                intervalMillis: params.intervalMillis,
                leadInMillis: params.leadInMillis,
                teams: params.teams,
            }).then(ok => {
                if (!ok) feedback.error(t('timing.sequence.error.create'))
            })
        },
        [create, stationId, feedback, t],
    )

    const handleStart = useCallback(() => {
        void start().then(ok => {
            if (!ok) feedback.error(t('timing.sequence.error.start'))
        })
    }, [start, feedback, t])

    const handleAbort = useCallback(() => {
        confirmAction(
            () => {
                void abort().then(ok => {
                    if (!ok) feedback.error(t('timing.sequence.error.abort'))
                })
            },
            {
                title: t('timing.sequence.abortConfirm.title'),
                content: t('timing.sequence.abortConfirm.content'),
                okText: t('timing.sequence.abort'),
            },
        )
    }, [confirmAction, abort, feedback, t])

    // Skipping is irreversible (there is no "unskip"), and the buttons sit right next to the big
    // running countdown on a touch screen — so it always goes through a confirmation naming the team,
    // and is disabled while another mutation is in flight.
    const handleSkip = useCallback(
        (entryId: string, teamName: string) => {
            confirmAction(
                () => {
                    void skip(entryId).then(ok => {
                        if (!ok) feedback.error(t('timing.sequence.error.skip'))
                    })
                },
                {
                    title: t('timing.sequence.entry.skipConfirm.title'),
                    content: t('timing.sequence.entry.skipConfirm.content', {team: teamName}),
                    okText: t('timing.sequence.entry.skip'),
                },
            )
        },
        [confirmAction, skip, feedback, t],
    )

    let content: ReactNode
    if (sequence === undefined) {
        if (loading) {
            content = <Throbber />
        } else if (error) {
            content = (
                <Stack sx={{width: 1, maxWidth: 480, mx: 'auto'}} spacing={2}>
                    <Alert
                        severity="error"
                        action={
                            <Button color="inherit" size="small" onClick={refetch}>
                                {t('timing.sequence.retry')}
                            </Button>
                        }>
                        {t('timing.sequence.loadError')}
                    </Alert>
                </Stack>
            )
        } else {
            content = (
                <SetupForm
                    teams={orderedTeams}
                    teamsLoading={teamsLoading}
                    busy={busy}
                    onCreate={handleCreate}
                />
            )
        }
    } else if (sequence.state === 'ARMED') {
        content = (
            <ArmedView
                sequence={sequence}
                label={label}
                busy={busy}
                onStart={handleStart}
                onAbort={handleAbort}
                onSkip={handleSkip}
            />
        )
    } else if (sequence.state === 'RUNNING') {
        content = (
            <RunningView
                sequence={sequence}
                label={label}
                now={now}
                busy={busy}
                onAbort={handleAbort}
                onSkip={handleSkip}
            />
        )
    } else {
        content = <SummaryView sequence={sequence} label={label} onReset={reset} />
    }

    return (
        <Box
            data-sequence-panel=""
            onPointerDown={unlockAudio}
            sx={{
                flexGrow: 1,
                width: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                // The panel is its own scroll container: on a short viewport (a phone in landscape,
                // or with several board banners showing) the content's own minimum height can exceed
                // the space left over, and the abort button must stay reachable rather than being
                // clipped by the board's `overflow: hidden`.
                overflowY: 'auto',
            }}>
            {content}
        </Box>
    )
}

export default SequencePanel
