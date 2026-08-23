import {Box, Button, CircularProgress, IconButton, Stack, Tooltip, Typography} from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import WarningIcon from '@mui/icons-material/Warning'
import BlockIcon from '@mui/icons-material/Block'
import UndoIcon from '@mui/icons-material/Undo'
import EditIcon from '@mui/icons-material/Edit'
import {useTranslation} from 'react-i18next'
import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {retractTimeMark} from '@api/sdk.gen.ts'
import {TimingMatchDto, TimingTeamDto} from '@api/types.gen.ts'
import {useFeedback} from '@utils/hooks.ts'
import {BoardMark} from '@components/timing/useTimingBoardState.ts'
import {groupMarksByMatch} from '@utils/timing/markGrouping.ts'
import {matchTitle} from '@components/timing/matchDisplay.tsx'
import AssignTeamDialog from '@components/timing/AssignTeamDialog.tsx'

/** Shortened form of a team id used when a mark is assigned to a team not present in `teams` (e.g. a
 * team that was deleted after the assignment was made). */
function shortenTeamId(id: string): string {
    return id.slice(0, 8)
}

function teamDisplayLabel(team: TimingTeamDto): string {
    const start = team.startNumber !== undefined ? `#${team.startNumber}` : '#–'
    const name = team.teamName ?? team.clubName ?? ''
    return [start, name].filter(part => part.length > 0).join(' ')
}

function formatMarkTime(ms: number): string {
    const date = new Date(ms)
    const hh = String(date.getHours()).padStart(2, '0')
    const mm = String(date.getMinutes()).padStart(2, '0')
    const ss = String(date.getSeconds()).padStart(2, '0')
    const tenths = Math.floor(date.getMilliseconds() / 100)
    return `${hh}:${mm}:${ss}.${tenths}`
}

export type MarkListProps = {
    eventId: string
    stationId: string
    marks: BoardMark[]
    /** All of the event's teams, loaded once per board mount and sorted by start number. */
    teams: TimingTeamDto[]
    /** True while the initial teams request is still in flight (forwarded to the assign dialog). */
    teamsLoading?: boolean
    /**
     * Die Partien der Startliste — gruppiert die Liste in Partie-Blöcke („09:20 Finale CF2x" als
     * Gruppenkopf), damit sichtbar ist, was zusammen gestartet wurde. Ohne Partien bleibt die
     * Liste flach.
     */
    matches?: TimingMatchDto[]
}

/**
 * Reverse-chronological list of this station's captured marks: a 1-based sequence number, the time
 * of day at 0.1s precision, a status icon, and an undo button for active marks.
 *
 * **Sequence numbers are first-seen, not timestamp-sorted.** Operators reference marks by number
 * verbally, so a number must never change once shown. A mark's number is assigned the first time its
 * id is observed in `marks` and then kept forever in `sequenceMapRef`, a plain ref (not state) so
 * assigning numbers never itself triggers a render. This matters because marks can arrive out of
 * order (a websocket message delivered late, or a snapshot merge/replay) with a `timestampMillis`
 * earlier than marks already displayed — deriving numbers from a timestamp sort, as before, would
 * silently renumber everything already on screen. First-seen order sidesteps that: a late mark just
 * gets appended to the sequence instead of shifting existing numbers. Display order (newest on top)
 * still sorts by `timestampMillis` — only the numbering itself is first-seen-based.
 * `sequenceMapRef`/`nextSequenceRef` are reset whenever `eventId`/`stationId` changes, so switching
 * event or station starts a fresh sequence instead of carrying over the previous board's numbers.
 */
const MarkList = ({eventId, stationId, marks, teams, teamsLoading = false, matches}: MarkListProps) => {
    const {t} = useTranslation()
    const feedback = useFeedback()
    const [retracting, setRetracting] = useState<Set<string>>(new Set())

    // --- Team assignment ------------------------------------------------------------------------
    //
    // `localAssignments` overlays the still-in-flight optimistic result of an assign/detach on top
    // of `marks` (which only reflects `assignedTeam` once the server's create response or the
    // websocket `assignmentChanged` echo lands) — the same "optimistic overlay, cleared once the
    // real state catches up" shape as `retracting` above.
    const [localAssignments, setLocalAssignments] = useState<Map<string, string | null>>(new Map())
    const [assignDialogMarkId, setAssignDialogMarkId] = useState<string | null>(null)

    const teamById = useMemo(
        () => new Map(teams.map(team => [team.competitionMatchTeam, team])),
        [teams],
    )

    const handleAssign = useCallback((markId: string, competitionMatchTeam: string | null) => {
        setLocalAssignments(prev => {
            // If the new value equals the mark's real assignedTeam, delete the overlay entry
            // so the map doesn't grow unbounded with redundant entries (especially on rollback).
            const mark = marks.find(m => m.id === markId)
            const realTeam = mark?.assignedTeam ?? null
            if (realTeam === competitionMatchTeam) {
                const next = new Map(prev)
                next.delete(markId)
                return next
            }
            return new Map(prev).set(markId, competitionMatchTeam)
        })
    }, [marks])

    // Once a mark's real `assignedTeam` matches the optimistic overlay, the overlay is redundant —
    // drop it so the map doesn't grow unbounded over a long session (mirrors the `retracting` cleanup
    // effect below).
    useEffect(() => {
        setLocalAssignments(prev => {
            if (prev.size === 0) return prev
            let next: Map<string, string | null> | null = null
            for (const [markId, optimisticTeam] of prev) {
                const mark = marks.find(m => m.id === markId)
                const realTeam = mark?.assignedTeam ?? null
                if (mark === undefined || realTeam === optimisticTeam) {
                    next = next ?? new Map(prev)
                    next.delete(markId)
                }
            }
            return next ?? prev
        })
    }, [marks])

    const sequenceMapRef = useRef<Map<string, number>>(new Map())
    const nextSequenceRef = useRef(1)
    const resetKeyRef = useRef(`${eventId}:${stationId}`)

    const resetKey = `${eventId}:${stationId}`
    if (resetKeyRef.current !== resetKey) {
        resetKeyRef.current = resetKey
        sequenceMapRef.current = new Map()
        nextSequenceRef.current = 1
    }
    // Assign the next sequence number to any id not seen before. Idempotent by construction (already
    // -seen ids are skipped), so it's safe to run on every render rather than only inside an effect.
    for (const mark of marks) {
        if (!sequenceMapRef.current.has(mark.id)) {
            sequenceMapRef.current.set(mark.id, nextSequenceRef.current++)
        }
    }
    const sequenceById = sequenceMapRef.current

    const reversedMarks = useMemo(
        () => [...marks].sort((a, b) => b.timestampMillis - a.timestampMillis),
        [marks],
    )

    // Partie-Blöcke, sobald es eine Startliste gibt: jede Zeit trägt dann Partie UND Boot, und
    // die Gruppenköpfe zeigen, was zusammen gestartet wurde. Ohne Partien (kein INTERN-Wettkampf)
    // bleibt die flache Liste — dann gäbe es ohnehin nur die Sammelgruppe.
    const grouped = matches !== undefined && matches.length > 0
    const groups = useMemo(
        () =>
            grouped
                ? groupMarksByMatch(marks, matches)
                : [{match: undefined, marks: reversedMarks}],
        [grouped, marks, matches, reversedMarks],
    )

    // Once a mark's real status becomes RETRACTED (via the websocket echo or a refetch), the
    // optimistic flag for it is redundant — drop it so the set doesn't grow unbounded over a long
    // session.
    useEffect(() => {
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

    /**
     * Optimistic retract. A failure rolls the strike-through back, which on its own is far too quiet —
     * the row simply reverts and the operator is left believing the undo worked. So every failure path
     * also raises a snackbar: the rollback says *what* the state is, the feedback says *why*.
     */
    const handleUndo = useCallback(
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
                    const {error} = await retractTimeMark({
                        path: {eventId, timeMarkId: mark.id},
                    })
                    if (error !== undefined) {
                        rollback()
                    }
                } catch {
                    rollback()
                }
            })()
        },
        [eventId, feedback, t],
    )

    // Overlay the optimistic assignment (if any) so the dialog's "current team"/detach-button state
    // reflects a just-submitted-but-not-yet-echoed change instead of the stale server value.
    const rawAssignDialogMark = marks.find(m => m.id === assignDialogMarkId)
    const assignDialogMark =
        rawAssignDialogMark !== undefined && localAssignments.has(rawAssignDialogMark.id)
            ? {...rawAssignDialogMark, assignedTeam: localAssignments.get(rawAssignDialogMark.id) ?? undefined}
            : rawAssignDialogMark

    const renderMark = (mark: BoardMark) => {
                const isRetracted = mark.status === 'RETRACTED' || retracting.has(mark.id)
                // `failed` disqualifies a mark just as `pending` does: in both cases the server has no
                // record of it, so retracting or assigning it could only 404. The mark is still queued
                // for submission — these actions become available once it is actually saved.
                const isOnServer = !mark.pending && !mark.failed
                const canUndo = mark.status === 'ACTIVE' && isOnServer && !retracting.has(mark.id)

                let icon
                if (mark.pending) {
                    icon = <CircularProgress size={20} />
                } else if (mark.failed) {
                    icon = <WarningIcon color="error" fontSize="small" />
                } else if (isRetracted) {
                    icon = <BlockIcon color="disabled" fontSize="small" />
                } else {
                    icon = <CheckCircleIcon color="success" fontSize="small" />
                }

                return (
                    <Stack
                        key={mark.id}
                        direction="row"
                        alignItems="center"
                        spacing={2}
                        sx={{py: 0.75}}>
                        <Typography
                            variant="body2"
                            sx={{width: 32, flexShrink: 0, color: 'text.secondary'}}>
                            #{sequenceById.get(mark.id)}
                        </Typography>
                        {icon}
                        <Typography
                            variant="body1"
                            sx={{
                                fontFamily: 'monospace',
                                fontVariantNumeric: 'tabular-nums',
                                textDecoration: isRetracted ? 'line-through' : 'none',
                                color: isRetracted ? 'text.disabled' : 'text.primary',
                            }}>
                            {formatMarkTime(mark.timestampMillis)}
                        </Typography>
                        {mark.pending && (
                            <Typography variant="caption" color="text.secondary">
                                {t('timing.board.mark.pending')}
                            </Typography>
                        )}
                        {mark.failed && (
                            <Typography variant="caption" color="error">
                                {t('timing.board.mark.failed')}
                            </Typography>
                        )}
                        <Box sx={{flexGrow: 1}} />
                        {mark.status === 'ACTIVE' && isOnServer &&
                            (() => {
                                const effectiveTeamId = localAssignments.has(mark.id)
                                    ? localAssignments.get(mark.id)!
                                    : (mark.assignedTeam ?? null)

                                if (effectiveTeamId === null) {
                                    return (
                                        <Button
                                            size="small"
                                            variant="outlined"
                                            onClick={() => setAssignDialogMarkId(mark.id)}>
                                            {t('timing.assign.assign')}
                                        </Button>
                                    )
                                }

                                const team = teamById.get(effectiveTeamId)
                                const label = team
                                    ? teamDisplayLabel(team)
                                    : shortenTeamId(effectiveTeamId)

                                return (
                                    <Stack direction="row" alignItems="center" spacing={0.5}>
                                        <Typography variant="body2">{label}</Typography>
                                        <Tooltip title={t('timing.assign.edit')}>
                                            <IconButton
                                                size="small"
                                                aria-label={t('timing.assign.edit')}
                                                onClick={() => setAssignDialogMarkId(mark.id)}>
                                                <EditIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    </Stack>
                                )
                            })()}
                        {canUndo && (
                            <Tooltip title={t('timing.board.mark.undo')}>
                                <IconButton
                                    size="small"
                                    aria-label={t('timing.board.mark.undo')}
                                    onClick={() => handleUndo(mark)}>
                                    <UndoIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        )}
                    </Stack>
                )
    }

    return (
        <Stack sx={{width: 1}} spacing={grouped ? 1.5 : 0}>
            {groups.map(group => (
                <Stack
                    key={group.match?.competitionSetupMatch ?? 'ohne-partie'}
                    sx={{width: 1}}>
                    {grouped && (
                        <Typography
                            variant="overline"
                            sx={{color: 'text.secondary', lineHeight: 2}}>
                            {group.match !== undefined
                                ? matchTitle(group.match)
                                : t('timing.marks.noMatchGroup')}
                        </Typography>
                    )}
                    <Stack
                        divider={<Box sx={{borderBottom: 1, borderColor: 'divider'}} />}
                        sx={{width: 1}}>
                        {group.marks.map(renderMark)}
                    </Stack>
                </Stack>
            ))}
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

export default MarkList
