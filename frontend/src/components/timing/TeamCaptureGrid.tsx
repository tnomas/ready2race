import {
    Box,
    ButtonBase,
    Chip,
    CircularProgress,
    Stack,
    ToggleButton,
    Typography,
} from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import BoltIcon from '@mui/icons-material/Bolt'
import {useTranslation} from 'react-i18next'
import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {TimingTeamDto} from '@api/types.gen.ts'
import {useFeedback} from '@utils/hooks.ts'
import {CaptureFn} from '@components/timing/useCaptureFlow.ts'
import {isTypingContext} from '@utils/timing/shortcutGuards.ts'

/**
 * Key labels of the armed slots, in arming order. Length also caps how many teams can be armed at
 * once — there is no ninth key, and a slot without a key is useless.
 *
 * A-H rather than the digits: the digits already mean "the team with that start number", and reusing
 * them would make the same keystroke mean two different things depending on invisible state.
 */
const ARMED_KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const

/**
 * Fixed slot palette, index-aligned with `ARMED_KEYS`. Hard-coded hex rather than theme colors: these
 * have to stay apart from each other at a glance on a phone in daylight, which the theme's semantic
 * palette (mostly one blue and one red) cannot provide.
 */
const ARMED_COLORS = [
    '#e53935',
    '#1e88e5',
    '#43a047',
    '#fb8c00',
    '#8e24aa',
    '#00acc1',
    '#d81b60',
    '#5e35b1',
] as const

function teamLabel(team: TimingTeamDto): string {
    return team.teamName ?? team.clubName ?? team.participantNames.join(', ')
}

export type TeamCaptureGridProps = {
    /** All of the event's teams, sorted by start number by the board page. */
    teams: TimingTeamDto[]
    teamsLoading: boolean
    /**
     * Teams that already have an ACTIVE mark assigned **at this station** — they are done here and
     * their button is disabled, which is the grid's whole protection against double-capturing a team.
     */
    finishedTeams: Set<string>
    /** The board's capture flow; called with a team id, so capture and assignment are one gesture. */
    capture: CaptureFn
    /** True while capture is impossible at all (clock not synced / station still loading). */
    disabled: boolean
    /** Why capture is impossible, rendered under the grid. */
    disabledReason?: string
}

/**
 * Direct-tap capture surface: one large button per team, tapped the moment that team crosses the line.
 * A tap is capture **and** assignment in one gesture, which is what makes this usable at a split point
 * where the operator knows who is coming.
 *
 * **Armed mode.** Tapping teams while "Scharfstellen" is on doesn't capture — it builds an ordered list
 * of armed slots, each with a color and a letter key (A, B, C… in arming order). Pressing that letter
 * (or tapping the chip) then captures that team and frees the slot. For the last metres of a race the
 * operator no longer hunts for the right button in a grid of dozens, they look at four color
 * chips and press four keys.
 *
 * **Digits.** 1-9 capture the team with that start number, but only while it is unambiguous: start
 * numbers repeat across competitions, and firing on the first match would silently attribute a time to
 * the wrong team. An ambiguous (or unknown, or already finished) digit does nothing.
 *
 * All shortcuts are suppressed while a dialog or a text field has focus — see `isTypingContext`. Space
 * is *not* handled here: it stays the board page's "bank a time without a team" shortcut in every view.
 */
const TeamCaptureGrid = ({
    teams,
    teamsLoading,
    finishedTeams,
    capture,
    disabled,
    disabledReason,
}: TeamCaptureGridProps) => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const [arming, setArming] = useState(false)
    /** Armed team ids in arming order; the index is the slot's key and color. */
    const [armed, setArmed] = useState<string[]>([])

    const finishedRef = useRef(finishedTeams)
    finishedRef.current = finishedTeams

    /**
     * A team can finish without ever being triggered from its slot — someone taps it in the grid on a
     * second device, or the two-step flow assigns it — and a slot for a team that is already done is
     * a trap: pressing its key would capture a duplicate. So slots are pruned whenever their team
     * finishes or disappears from the roster, which also keeps the letters compact.
     */
    useEffect(() => {
        setArmed(prev => {
            const next = prev.filter(
                id => !finishedTeams.has(id) && teams.some(team => team.competitionMatchTeam === id),
            )
            return next.length === prev.length ? prev : next
        })
    }, [finishedTeams, teams])

    /**
     * Start number → team, but only for start numbers that identify exactly one team. Numbers shared by
     * several teams (different competitions can each number from 1) are deliberately left out rather
     * than resolved to an arbitrary one.
     */
    const unambiguousByStartNumber = useMemo(() => {
        const byNumber = new Map<number, TimingTeamDto | null>()
        for (const team of teams) {
            if (team.startNumber === undefined) continue
            byNumber.set(team.startNumber, byNumber.has(team.startNumber) ? null : team)
        }
        return byNumber
    }, [teams])

    const captureTeam = useCallback(
        (teamId: string) => {
            if (disabled || finishedRef.current.has(teamId)) return
            capture(teamId)
            setArmed(prev => prev.filter(id => id !== teamId))
        },
        [disabled, capture],
    )

    const toggleArmed = useCallback(
        (teamId: string) => {
            setArmed(prev => {
                if (prev.includes(teamId)) return prev.filter(id => id !== teamId)
                if (prev.length >= ARMED_KEYS.length) {
                    feedback.warning(t('timing.board.teams.armedFull', {count: ARMED_KEYS.length}))
                    return prev
                }
                return [...prev, teamId]
            })
        },
        [feedback, t],
    )

    const handleTeamPress = useCallback(
        (teamId: string) => {
            if (arming) {
                toggleArmed(teamId)
                return
            }
            captureTeam(teamId)
        },
        [arming, toggleArmed, captureTeam],
    )

    // Mirrored so the key listener can stay registered once instead of being torn down and rebuilt on
    // every armed-list or roster change.
    const handlersRef = useRef({armed, captureTeam, unambiguousByStartNumber})
    handlersRef.current = {armed, captureTeam, unambiguousByStartNumber}

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            // A shortcut is a bare keypress; anything with a modifier belongs to the browser or the OS.
            if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return
            if (isTypingContext()) return

            const {armed: armedNow, captureTeam: fire, unambiguousByStartNumber: byNumber} =
                handlersRef.current

            const key = event.key.toUpperCase()
            const slot = ARMED_KEYS.indexOf(key as (typeof ARMED_KEYS)[number])
            if (slot !== -1) {
                const teamId = armedNow[slot]
                if (teamId === undefined) return
                event.preventDefault()
                fire(teamId)
                return
            }

            if (key >= '1' && key <= '9') {
                const team = byNumber.get(Number(key))
                // `null` means the number is ambiguous — see `unambiguousByStartNumber`.
                if (team === undefined || team === null) return
                event.preventDefault()
                fire(team.competitionMatchTeam)
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [])

    const teamById = useMemo(
        () => new Map(teams.map(team => [team.competitionMatchTeam, team])),
        [teams],
    )

    return (
        <Stack sx={{width: 1, minHeight: 0, flexGrow: 1}} spacing={1}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{flexShrink: 0}}>
                <ToggleButton
                    value="arm"
                    size="small"
                    selected={arming}
                    onChange={() => setArming(prev => !prev)}>
                    <BoltIcon fontSize="small" sx={{mr: 0.5}} />
                    {t('timing.board.teams.arm')}
                </ToggleButton>
                <Typography variant="caption" color="text.secondary">
                    {arming ? t('timing.board.teams.armHint') : t('timing.board.teams.hint')}
                </Typography>
            </Stack>

            {armed.length > 0 && (
                <Stack
                    direction="row"
                    spacing={1}
                    sx={{flexShrink: 0, flexWrap: 'wrap', rowGap: 1}}>
                    {armed.map((teamId, index) => {
                        const team = teamById.get(teamId)
                        const color = ARMED_COLORS[index % ARMED_COLORS.length]
                        return (
                            <Chip
                                key={teamId}
                                label={`${ARMED_KEYS[index]} · ${
                                    team?.startNumber !== undefined ? `#${team.startNumber}` : ''
                                } ${team ? teamLabel(team) : ''}`.trim()}
                                onClick={() => captureTeam(teamId)}
                                onDelete={() =>
                                    setArmed(prev => prev.filter(id => id !== teamId))
                                }
                                aria-label={t('timing.board.teams.unarm')}
                                sx={{
                                    bgcolor: color,
                                    color: '#fff',
                                    fontWeight: 700,
                                    '& .MuiChip-deleteIcon': {color: 'rgba(255,255,255,0.8)'},
                                }}
                            />
                        )
                    })}
                </Stack>
            )}

            <Box sx={{flexGrow: 1, minHeight: 0, overflowY: 'auto'}}>
                {teamsLoading && teams.length === 0 && (
                    <Stack alignItems="center" sx={{py: 4}}>
                        <CircularProgress />
                    </Stack>
                )}
                {!teamsLoading && teams.length === 0 && (
                    <Typography variant="body2" color="text.secondary" sx={{py: 2}}>
                        {t('timing.board.teams.empty')}
                    </Typography>
                )}
                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                        gap: 1,
                    }}>
                    {teams.map(team => {
                        const teamId = team.competitionMatchTeam
                        const finished = finishedTeams.has(teamId)
                        const armedIndex = armed.indexOf(teamId)
                        const color =
                            armedIndex === -1
                                ? undefined
                                : ARMED_COLORS[armedIndex % ARMED_COLORS.length]
                        return (
                            <ButtonBase
                                key={teamId}
                                // Same reasoning as `CaptureButton`: the timestamp must be taken at
                                // the physical press, not at the release.
                                onPointerDown={() => handleTeamPress(teamId)}
                                onClick={event => event.preventDefault()}
                                disabled={finished || (disabled && !arming)}
                                focusRipple
                                sx={{
                                    borderRadius: 2,
                                    p: 1,
                                    minHeight: 72,
                                    border: 2,
                                    borderColor: color ?? 'divider',
                                    bgcolor: finished ? 'action.disabledBackground' : 'background.paper',
                                    color: finished ? 'text.disabled' : 'text.primary',
                                    opacity: finished ? 0.6 : 1,
                                    textAlign: 'left',
                                    '&:active': finished ? undefined : {bgcolor: 'action.selected'},
                                }}>
                                <Stack sx={{width: 1, minWidth: 0}} spacing={0.25}>
                                    <Stack direction="row" alignItems="center" spacing={0.5}>
                                        <Typography variant="h6" sx={{fontWeight: 700}}>
                                            {team.startNumber !== undefined
                                                ? `#${team.startNumber}`
                                                : '#–'}
                                        </Typography>
                                        {color !== undefined && (
                                            <Box
                                                component="span"
                                                sx={{
                                                    bgcolor: color,
                                                    color: '#fff',
                                                    borderRadius: 1,
                                                    px: 0.75,
                                                    fontSize: 12,
                                                    fontWeight: 700,
                                                }}>
                                                {ARMED_KEYS[armedIndex]}
                                            </Box>
                                        )}
                                        <Box sx={{flexGrow: 1}} />
                                        {finished && (
                                            <CheckCircleIcon color="success" fontSize="small" />
                                        )}
                                    </Stack>
                                    <Typography
                                        variant="body2"
                                        sx={{
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        }}>
                                        {teamLabel(team)}
                                    </Typography>
                                </Stack>
                            </ButtonBase>
                        )
                    })}
                </Box>
            </Box>

            {disabled && disabledReason !== undefined && (
                <Typography variant="body2" color="error" textAlign="center" sx={{flexShrink: 0}}>
                    {disabledReason}
                </Typography>
            )}
        </Stack>
    )
}

export default TeamCaptureGrid
