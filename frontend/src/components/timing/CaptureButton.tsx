import {ButtonBase, Stack, Typography} from '@mui/material'
import FlagIcon from '@mui/icons-material/Flag'
import {useTranslation} from 'react-i18next'
import {forwardRef, MouseEvent, useCallback, useImperativeHandle} from 'react'
import {createTimeMark} from '@api/sdk.gen.ts'
import {TimeMarkDto, TimingStationDto} from '@api/types.gen.ts'
import {playCaptureFeedback} from '@utils/timing/feedback.ts'
import {enqueue, PendingTimeMark, remove as removeQueued} from '@utils/timing/offlineQueue.ts'

export type CaptureButtonHandle = {
    /** Trigger the capture flow programmatically — used by the board page's Space-bar shortcut. */
    capture: () => void
}

export type CaptureButtonProps = {
    eventId: string
    /** The current station, or undefined while the board's initial state load is still in flight. */
    station: TimingStationDto | undefined
    now: () => number | null
    applyLocalMark: (mark: TimeMarkDto) => void
    markSaved: (id: string) => void
    markFailed: (id: string) => void
    /**
     * Called exactly once per capture, right after the write-ahead enqueue attempt, with the mark's id
     * and whether it actually made it into the durable queue. `false` means this capture exists only
     * in memory and will be lost on reload — the board surfaces that as its own banner, because it is
     * a materially worse situation than "queued, not yet submitted".
     *
     * The id is part of the signature because the banner is per-mark, not a global flag: the board
     * tracks *which* captures are unbuffered and clears each one when that same id is later reported
     * to `markSaved`. A bare boolean cannot express either half of that.
     */
    onBuffered: (id: string, buffered: boolean) => void
    /**
     * Called whenever the capture flow changed the queue's contents, so the board page can refresh
     * its queue-status banner immediately instead of waiting for the next periodic drain/count check.
     */
    onQueueChanged: () => void
}

/**
 * The huge capture button: one tap (or a Space-bar press forwarded from the board page) records a
 * time mark at the current server-synced instant, write-ahead-buffered in IndexedDB before the POST
 * goes out (see `captureMark`). Disabled — with a visible reason — until the clock is synced, since
 * capture must never use a wrong (unsynced) clock, and until the station is known.
 *
 * An expired session is deliberately **not** a reason to disable it. Losing a race time is worse than
 * showing a stale mark: the capture goes through the ordinary write-ahead path, so it lands durably in
 * the offline queue, its POST fails as retryable (401), and it is submitted for real once the operator
 * has logged in again. The board's `UNAUTHORIZED` banner is what tells them to do that.
 *
 * Capture fires on `onPointerDown`, not `onClick`: the timestamp must be taken as close as possible
 * to the physical press, not the release. The button therefore also swallows the follow-up
 * synthetic `click` (fired after pointerup for a mouse/touch tap, or by the browser's native
 * Space/Enter activation of a focused button) so a single physical press can never record twice.
 */
const CaptureButton = forwardRef<CaptureButtonHandle, CaptureButtonProps>(function CaptureButton(
    {
        eventId,
        station,
        now,
        applyLocalMark,
        markSaved,
        markFailed,
        onBuffered,
        onQueueChanged,
    },
    ref,
) {
    const {t} = useTranslation()

    /**
     * The full capture flow, ordered **write-ahead**: the mark is put into the durable offline queue
     * *before* the POST is attempted, and only removed again once the server has confirmed it. That
     * makes the queue the single durable record of a capture — a tab killed mid-POST loses nothing,
     * because the next drain re-POSTs the item and the server deduplicates by the mark's UUID. The old
     * order (POST first, enqueue only on failure) had a window in which a capture existed nowhere but
     * in memory.
     *
     * If the enqueue itself fails there is no durable record to fall back on, so the mark is flagged
     * `failed` and the board is told via `onBuffered(false)`; the POST is still attempted, because an
     * unbuffered capture that reaches the server is strictly better than one that does neither.
     *
     * This is also the path an unauthorized capture takes: nothing here special-cases the session, so
     * a 401 is just another failed POST — the mark stays queued and a later drain submits it.
     */
    const captureMark = useCallback(() => {
        const ts = now()
        if (ts === null || station === undefined) return

        const id = crypto.randomUUID()
        const stationId = station.id
        const mark: TimeMarkDto = {
            id,
            event: eventId,
            station: stationId,
            timestampMillis: ts,
            source: 'APP_USER',
            status: 'ACTIVE',
        }

        applyLocalMark(mark)
        playCaptureFeedback()

        void (async () => {
            const item: PendingTimeMark = {
                id,
                eventId,
                station: stationId,
                timestampMillis: ts,
                attempts: 0,
            }

            // Step 1: write-ahead into the durable queue.
            let buffered = true
            try {
                await enqueue(item)
            } catch (error) {
                buffered = false
                console.warn(
                    `[timing] Zeitstempel ${id} konnte nicht gepuffert werden — Erfassung existiert nur im Speicher`,
                    error,
                )
                markFailed(id)
            }
            onBuffered(id, buffered)
            onQueueChanged()

            // Step 2: POST. Attempted even when step 1 failed.
            try {
                const {error} = await createTimeMark({
                    path: {eventId},
                    body: {id, station: stationId, timestampMillis: ts},
                })
                if (error !== undefined) {
                    // Left in the queue on purpose — the banner picks it up and the next drain
                    // retries (or dead-letters) it based on the response status it sees then.
                    markFailed(id)
                    return
                }
                markSaved(id)
            } catch {
                markFailed(id)
                return
            }

            // Confirmed by the server: the queue entry has done its job.
            try {
                await removeQueued(id)
            } catch (error) {
                console.warn(
                    `[timing] Zeitstempel ${id} wurde übertragen, konnte aber nicht aus der Warteschlange entfernt werden — der nächste Drain räumt auf`,
                    error,
                )
            }
            onQueueChanged()
        })()
    }, [
        now,
        station,
        eventId,
        applyLocalMark,
        markSaved,
        markFailed,
        onBuffered,
        onQueueChanged,
    ])

    useImperativeHandle(ref, () => ({capture: captureMark}), [captureMark])

    const clockNotSynced = now() === null
    const stationLoading = station === undefined
    const disabled = clockNotSynced || stationLoading

    const handlePointerDown = useCallback(() => {
        if (disabled) return
        captureMark()
    }, [disabled, captureMark])

    // Guard double-fire: capture already happened on pointerdown above — this only swallows the
    // synthetic click that follows.
    const handleClick = useCallback((event: MouseEvent) => {
        event.preventDefault()
    }, [])

    return (
        <Stack sx={{flexGrow: 1, width: 1, minHeight: 0}} spacing={1} alignItems="center">
            <ButtonBase
                onPointerDown={handlePointerDown}
                onClick={handleClick}
                disabled={disabled}
                focusRipple
                sx={{
                    flexGrow: 1,
                    width: 1,
                    minHeight: '40vh',
                    borderRadius: 2,
                    bgcolor: disabled ? 'action.disabledBackground' : 'primary.main',
                    color: disabled ? 'text.disabled' : 'primary.contrastText',
                    transition: 'background-color 0.1s',
                    '&:active': disabled ? undefined : {bgcolor: 'primary.dark'},
                }}>
                <Stack alignItems="center" spacing={2}>
                    <FlagIcon sx={{fontSize: {xs: 64, sm: 96}}} />
                    <Typography variant="h3" component="span" textAlign="center">
                        {station !== undefined ? t(`timing.station.types.${station.type}`) : ''}
                    </Typography>
                </Stack>
            </ButtonBase>
            {disabled && (
                <Typography variant="body2" color="error" textAlign="center">
                    {clockNotSynced
                        ? t('timing.board.capture.clockNotSynced')
                        : t('timing.board.capture.stationLoading')}
                </Typography>
            )}
        </Stack>
    )
})

export default CaptureButton
