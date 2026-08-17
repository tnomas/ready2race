import {Box, CircularProgress, IconButton, Stack, Tooltip, Typography} from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import WarningIcon from '@mui/icons-material/Warning'
import BlockIcon from '@mui/icons-material/Block'
import UndoIcon from '@mui/icons-material/Undo'
import {useTranslation} from 'react-i18next'
import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {retractTimeMark} from '@api/sdk.gen.ts'
import {BoardMark} from '@components/timing/useTimingBoardState.ts'

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
const MarkList = ({eventId, stationId, marks}: MarkListProps) => {
    const {t} = useTranslation()
    const [retracting, setRetracting] = useState<Set<string>>(new Set())

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

    const handleUndo = useCallback(
        (mark: BoardMark) => {
            setRetracting(prev => new Set(prev).add(mark.id))
            void (async () => {
                try {
                    const {error} = await retractTimeMark({
                        path: {eventId, timeMarkId: mark.id},
                    })
                    if (error !== undefined) {
                        setRetracting(prev => {
                            const next = new Set(prev)
                            next.delete(mark.id)
                            return next
                        })
                    }
                } catch {
                    setRetracting(prev => {
                        const next = new Set(prev)
                        next.delete(mark.id)
                        return next
                    })
                }
            })()
        },
        [eventId],
    )

    return (
        <Stack sx={{width: 1}} divider={<Box sx={{borderBottom: 1, borderColor: 'divider'}} />}>
            {reversedMarks.map(mark => {
                const isRetracted = mark.status === 'RETRACTED' || retracting.has(mark.id)
                const canUndo = mark.status === 'ACTIVE' && !mark.pending && !retracting.has(mark.id)

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
            })}
        </Stack>
    )
}

export default MarkList
