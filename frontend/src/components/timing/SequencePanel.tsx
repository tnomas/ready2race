import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {
    Alert,
    Button,
    Chip,
    Divider,
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
import {SequenceMode, TimingSequenceDto, TimingSequenceEntryDto, TimingTeamDto} from '@api/types.gen.ts'
import {UseSequenceResult} from '@utils/timing/useSequence.ts'
import {playCountdownBeep} from '@utils/timing/feedback.ts'

export type SequencePanelProps = {
    stationId: string
    teams: TimingTeamDto[]
    teamsLoading: boolean
    now: () => number | null
    sequenceState: UseSequenceResult
}

/** Short human label for a team: `#12 · Team Name`, falling back to whatever is available. */
function teamLabel(team: TimingTeamDto | undefined, fallbackId: string): string {
    if (team === undefined) return fallbackId
    const bits: string[] = []
    if (team.startNumber !== undefined) bits.push(`#${team.startNumber}`)
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
 * Big rAF-driven countdown to `targetMillis`, written directly into a ref'd element's `textContent`
 * (like `BoardHeader`'s clock) so the rest of the panel doesn't re-render every frame. Also fires the
 * countdown beeps (`playCountdownBeep`) at T-5..T-1 (short) and T-0 (long/final), guarding against
 * repeats within the same second via `lastBeepedSecondRef`. Resets that guard whenever `targetMillis`
 * changes (INTERVAL mode moves the target to the next entry once the current one fires).
 */
const RunningCountdown = ({targetMillis, now}: {targetMillis: number; now: () => number | null}) => {
    const textRef = useRef<HTMLSpanElement | null>(null)
    const nowRef = useRef(now)
    const lastBeepedSecondRef = useRef<number>(Number.NaN)

    useEffect(() => {
        nowRef.current = now
    })

    useEffect(() => {
        lastBeepedSecondRef.current = Number.NaN
        let rafId: number

        const tick = () => {
            const current = nowRef.current()
            if (current !== null && textRef.current) {
                const remaining = targetMillis - current
                textRef.current.textContent = formatCountdown(remaining)

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
            sx={{fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums', fontWeight: 700}}>
            {COUNTDOWN_PLACEHOLDER}
        </Typography>
    )
}

type SetupFormProps = {
    mode: SequenceMode
    intervalSeconds: number
    teamsCount: number
    disabled: boolean
    onModeChange: (mode: SequenceMode) => void
    onIntervalChange: (seconds: number) => void
    onCreate: () => void
}

/**
 * Minimal setup form (see Plan-3 Task C timebox note): mode toggle, interval field (INTERVAL only),
 * and a single button that arms the sequence with *all* loaded teams in start-number order — no
 * per-team ordered multi-select/remove UI.
 */
const SetupForm = ({
    mode,
    intervalSeconds,
    teamsCount,
    disabled,
    onModeChange,
    onIntervalChange,
    onCreate,
}: SetupFormProps) => {
    const {t} = useTranslation()

    return (
        <Stack sx={{flexGrow: 1, width: 1, maxWidth: 480, mx: 'auto'}} spacing={3} justifyContent="center">
            <Typography variant="h5" textAlign="center">
                {t('timing.sequence.setup.title')}
            </Typography>
            <ToggleButtonGroup
                value={mode}
                exclusive
                fullWidth
                onChange={(_, value: SequenceMode | null) => {
                    if (value !== null) onModeChange(value)
                }}>
                <ToggleButton value="MASS">{t('timing.sequence.mode.MASS')}</ToggleButton>
                <ToggleButton value="INTERVAL">{t('timing.sequence.mode.INTERVAL')}</ToggleButton>
            </ToggleButtonGroup>
            {mode === 'INTERVAL' && (
                <TextField
                    type="number"
                    label={t('timing.sequence.setup.intervalSeconds')}
                    value={intervalSeconds}
                    onChange={event => onIntervalChange(Math.max(1, Number(event.target.value) || 0))}
                    slotProps={{htmlInput: {min: 1}}}
                    fullWidth
                />
            )}
            <Typography variant="body2" color="text.secondary" textAlign="center">
                {t('timing.sequence.setup.teamsCount', {count: teamsCount})}
            </Typography>
            <Button variant="contained" size="large" disabled={disabled} onClick={onCreate}>
                {t('timing.sequence.setup.armButton')}
            </Button>
        </Stack>
    )
}

type EntryRowProps = {
    entry: TimingSequenceEntryDto
    label: string
    skippable: boolean
    onSkip: (entryId: string) => void
}

const EntryRow = ({entry, label, skippable, onSkip}: EntryRowProps) => {
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
            {entry.status === 'STARTED' && entry.plannedStartMillis !== undefined && (
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
                    onClick={() => onSkip(entry.id)}>
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
    onSkip: (entryId: string) => void
}

const ArmedView = ({sequence, label, busy, onStart, onAbort, onSkip}: ArmedViewProps) => {
    const {t} = useTranslation()
    const entries = useMemo(
        () => [...sequence.entries].sort((a, b) => a.position - b.position),
        [sequence.entries],
    )

    return (
        <Stack sx={{flexGrow: 1, width: 1, minHeight: 0}} spacing={2}>
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
    onSkip: (entryId: string) => void
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

    const targetMillis = next?.plannedStartMillis ?? sequence.startedAtMillis

    return (
        <Stack sx={{flexGrow: 1, width: 1, minHeight: 0}} spacing={2} alignItems="center">
            {next === undefined ? (
                <Typography variant="h5">{t('timing.sequence.running.finishing')}</Typography>
            ) : (
                <>
                    {targetMillis !== undefined && (
                        <RunningCountdown targetMillis={targetMillis} now={now} />
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
                                onSkip={onSkip}
                            />
                        ))}
                    </Stack>
                )}
            </Stack>
            {next !== undefined && (
                <IconButton
                    size="small"
                    aria-label={t('timing.sequence.entry.skip')}
                    onClick={() => onSkip(next.id)}>
                    <SkipNextIcon />
                </IconButton>
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
        <Stack sx={{flexGrow: 1, width: 1, minHeight: 0}} spacing={2}>
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
 */
const SequencePanel = ({stationId, teams, teamsLoading, now, sequenceState}: SequencePanelProps) => {
    const {t} = useTranslation()
    const {confirmAction} = useConfirmation()
    const feedback = useFeedback()
    const {sequence, busy, create, start, abort, skip, reset} = sequenceState

    const teamsById = useMemo(() => {
        const map = new Map<string, TimingTeamDto>()
        teams.forEach(team => map.set(team.competitionMatchTeam, team))
        return map
    }, [teams])

    const label = useCallback((id: string) => teamLabel(teamsById.get(id), id), [teamsById])

    const [mode, setMode] = useState<SequenceMode>('MASS')
    const [intervalSeconds, setIntervalSeconds] = useState(60)

    const handleCreate = useCallback(() => {
        void create({
            station: stationId,
            mode,
            intervalMillis: mode === 'INTERVAL' ? intervalSeconds * 1000 : undefined,
            teams: teams.map(team => team.competitionMatchTeam),
        }).then(ok => {
            if (!ok) feedback.error(t('timing.sequence.error.create'))
        })
    }, [create, stationId, mode, intervalSeconds, teams, feedback, t])

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

    const handleSkip = useCallback(
        (entryId: string) => {
            void skip(entryId).then(ok => {
                if (!ok) feedback.error(t('timing.sequence.error.skip'))
            })
        },
        [skip, feedback, t],
    )

    if (sequence === undefined) {
        return (
            <SetupForm
                mode={mode}
                intervalSeconds={intervalSeconds}
                teamsCount={teams.length}
                disabled={busy || teamsLoading || teams.length === 0}
                onModeChange={setMode}
                onIntervalChange={setIntervalSeconds}
                onCreate={handleCreate}
            />
        )
    }

    if (sequence.state === 'ARMED') {
        return (
            <ArmedView
                sequence={sequence}
                label={label}
                busy={busy}
                onStart={handleStart}
                onAbort={handleAbort}
                onSkip={handleSkip}
            />
        )
    }

    if (sequence.state === 'RUNNING') {
        return (
            <RunningView
                sequence={sequence}
                label={label}
                now={now}
                busy={busy}
                onAbort={handleAbort}
                onSkip={handleSkip}
            />
        )
    }

    return <SummaryView sequence={sequence} label={label} onReset={reset} />
}

export default SequencePanel
