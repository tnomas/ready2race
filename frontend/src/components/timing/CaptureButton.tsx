import {ButtonBase, Stack, Typography} from '@mui/material'
import FlagIcon from '@mui/icons-material/Flag'
import {useTranslation} from 'react-i18next'
import {forwardRef, MouseEvent, useCallback, useImperativeHandle} from 'react'
import {createTimeMark} from '@api/sdk.gen.ts'
import {TimeMarkDto, TimingStationDto} from '@api/types.gen.ts'
import {playCaptureFeedback} from '@utils/timing/feedback.ts'
import {enqueue} from '@utils/timing/offlineQueue.ts'

export type CaptureButtonHandle = {
    /** Trigger the capture flow programmatically — used by the board page's Space-bar shortcut. */
    capture: () => void
}

export type CaptureButtonProps = {
    eventId: string
    /** The current station, or undefined while the board's initial state load is still in flight. */
    station: TimingStationDto | undefined
    now: () => number | null
    /**
     * True while the board's websocket session is `UNAUTHORIZED` (e.g. the session expired). A
     * capture made in this state can never be saved (the create request would just come back
     * unauthorized too), so it must be blocked outright rather than optimistically applied — no
     * local mark, no success beep/vibration.
     */
    unauthorized: boolean
    applyLocalMark: (mark: TimeMarkDto) => void
    markSaved: (id: string) => void
    markFailed: (id: string) => void
    /**
     * Called right after a failed capture has been written to the offline queue, so the board page
     * can immediately refresh its queue-status banner instead of waiting for the next periodic
     * drain/count check.
     */
    onQueued: () => void
}

/**
 * The huge capture button: one tap (or a Space-bar press forwarded from the board page) records a
 * time mark at the current server-synced instant. Disabled — with a visible reason — until the
 * clock is synced, since capture must never use a wrong (unsynced) clock; also disabled while the
 * session is unauthorized, since a capture that can never be saved shouldn't pretend to succeed.
 *
 * Capture fires on `onPointerDown`, not `onClick`: the timestamp must be taken as close as possible
 * to the physical press, not the release. The button therefore also swallows the follow-up
 * synthetic `click` (fired after pointerup for a mouse/touch tap, or by the browser's native
 * Space/Enter activation of a focused button) so a single physical press can never record twice.
 */
const CaptureButton = forwardRef<CaptureButtonHandle, CaptureButtonProps>(function CaptureButton(
    {eventId, station, now, unauthorized, applyLocalMark, markSaved, markFailed, onQueued},
    ref,
) {
    const {t} = useTranslation()

    /**
     * The full two-step capture flow. On a failed POST (network error or non-2xx) the mark is both
     * flagged `failed` (`markFailed`) and written to the offline queue (`enqueue`) for retry once
     * connectivity returns; `onQueued` lets the board page refresh its queue-status banner right away
     * instead of waiting for the next periodic drain/count check.
     *
     * The `unauthorized` guard lives here (not only in the button's `disabled` prop) so the Space-bar
     * shortcut — which calls this function directly via the imperative handle, bypassing the button's
     * `disabled` state — can never capture while unauthorized either.
     */
    const captureMark = useCallback(() => {
        const ts = now()
        if (ts === null || station === undefined || unauthorized) return

        const id = crypto.randomUUID()
        const mark: TimeMarkDto = {
            id,
            event: eventId,
            station: station.id,
            timestampMillis: ts,
            source: 'APP_USER',
            status: 'ACTIVE',
        }

        applyLocalMark(mark)
        playCaptureFeedback()

        void (async () => {
            try {
                const {error} = await createTimeMark({
                    path: {eventId},
                    body: {id, station: station.id, timestampMillis: ts},
                })
                if (error !== undefined) {
                    await enqueue({id, eventId, station: station.id, timestampMillis: ts})
                    markFailed(id)
                    onQueued()
                    return
                }
                markSaved(id)
            } catch {
                await enqueue({id, eventId, station: station.id, timestampMillis: ts})
                markFailed(id)
                onQueued()
            }
        })()
    }, [now, station, unauthorized, eventId, applyLocalMark, markSaved, markFailed, onQueued])

    useImperativeHandle(ref, () => ({capture: captureMark}), [captureMark])

    const clockNotSynced = now() === null
    const stationLoading = station === undefined
    const disabled = clockNotSynced || stationLoading || unauthorized

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
                    {unauthorized
                        ? t('timing.board.capture.unauthorized')
                        : clockNotSynced
                          ? t('timing.board.capture.clockNotSynced')
                          : t('timing.board.capture.stationLoading')}
                </Typography>
            )}
        </Stack>
    )
})

export default CaptureButton
