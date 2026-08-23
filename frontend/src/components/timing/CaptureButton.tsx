import {ButtonBase, Stack, Typography} from '@mui/material'
import FlagIcon from '@mui/icons-material/Flag'
import {useTranslation} from 'react-i18next'
import {MouseEvent, useCallback} from 'react'
import {TimingStationDto} from '@api/types.gen.ts'

export type CaptureButtonProps = {
    /** The current station, or undefined while the board's initial state load is still in flight. */
    station: TimingStationDto | undefined
    now: () => number | null
    /**
     * The board's capture flow (see `useCaptureFlow`), called without a team: this button always banks
     * an *unassigned* mark, which the operator attaches a team to afterwards from the mark list.
     */
    onCapture: () => void
    /**
     * Renders a smaller button — used when this is the manual fallback shown below the start board panel
     * on a START station, rather than the sole capture surface.
     */
    compact?: boolean
}

/**
 * The huge capture button: one tap (or a Space-bar press handled by the board page) records a time
 * mark at the current server-synced instant. Disabled — with a visible reason — until the clock is
 * synced, since capture must never use a wrong (unsynced) clock, and until the station is known.
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
 *
 * The write-ahead capture protocol itself lives in `useCaptureFlow`, owned by the board page — this
 * component is only the surface, so the button, the Space shortcut and the team grid all record marks
 * through exactly one implementation.
 */
const CaptureButton = ({station, now, onCapture, compact}: CaptureButtonProps) => {
    const {t} = useTranslation()

    const clockNotSynced = now() === null
    const stationLoading = station === undefined
    const disabled = clockNotSynced || stationLoading

    const handlePointerDown = useCallback(() => {
        if (disabled) return
        onCapture()
    }, [disabled, onCapture])

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
                    minHeight: compact ? '12vh' : '40vh',
                    borderRadius: 2,
                    bgcolor: disabled ? 'action.disabledBackground' : 'primary.main',
                    color: disabled ? 'text.disabled' : 'primary.contrastText',
                    transition: 'background-color 0.1s',
                    '&:active': disabled ? undefined : {bgcolor: 'primary.dark'},
                }}>
                <Stack alignItems="center" spacing={compact ? 1 : 2}>
                    <FlagIcon sx={{fontSize: compact ? {xs: 28, sm: 36} : {xs: 64, sm: 96}}} />
                    <Typography variant={compact ? 'h6' : 'h3'} component="span" textAlign="center">
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
}

export default CaptureButton
