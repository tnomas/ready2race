import {Alert, Box} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {useNavigate} from '@tanstack/react-router'
import {useEffect, useRef} from 'react'
import {useUser} from '@contexts/user/UserContext.ts'
import {updateAppTimingGlobal} from '@authorization/privileges.ts'
import {timingEventRoute, timingStationRoute} from '@routes'
import BoardHeader from '@components/timing/BoardHeader.tsx'
import {useTimingBoardState} from '@components/timing/useTimingBoardState.ts'
import {useServerClock} from '@utils/timing/useServerClock.ts'
import CaptureButton, {CaptureButtonHandle} from '@components/timing/CaptureButton.tsx'
import MarkList from '@components/timing/MarkList.tsx'

const TimingBoardPage = () => {
    const {t} = useTranslation()
    const user = useUser()
    const navigate = useNavigate()
    const {eventId} = timingEventRoute.useParams()
    const {stationId} = timingStationRoute.useParams()

    useEffect(() => {
        if (!user.checkPrivilege(updateAppTimingGlobal)) {
            void navigate({to: '/app/forbidden'})
        }
    }, [user, navigate])

    const clock = useServerClock()
    const {marks, stations, wsStatus, stateError, applyLocalMark, markSaved, markFailed} =
        useTimingBoardState(eventId, stationId)

    const station = stations.find(s => s.id === stationId)

    const showReconnectBanner = wsStatus === 'CONNECTING' || wsStatus === 'RECONNECTING'
    const showUnauthorizedBanner = wsStatus === 'UNAUTHORIZED'
    const showClockDegradedBanner = clock.quality === 'DEGRADED'

    const captureButtonRef = useRef<CaptureButtonHandle>(null)

    // Space bar triggers the same capture flow as the button — skipped while an input/textarea/select
    // has focus (so typing a space in a field doesn't fire a capture) or while a MUI dialog is open
    // (e.g. a future assignment/confirmation dialog sits on top of the board).
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.code !== 'Space' && event.key !== ' ') return

            const active = document.activeElement
            const tag = active?.tagName
            const isFormField =
                tag === 'INPUT' ||
                tag === 'TEXTAREA' ||
                tag === 'SELECT' ||
                (active instanceof HTMLElement && active.isContentEditable)
            const isDialogOpen = document.querySelector('[role="dialog"]') !== null

            if (isFormField || isDialogOpen) return

            event.preventDefault()
            captureButtonRef.current?.capture()
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [])

    return (
        <Box
            sx={{
                width: 1,
                height: '100dvh',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
            }}>
            <BoardHeader
                stationName={station?.name}
                wsStatus={wsStatus}
                clockQuality={clock.quality}
                now={clock.now}
            />

            {showUnauthorizedBanner && (
                <Alert severity="error" sx={{flexShrink: 0}}>
                    {t('timing.board.banner.unauthorized')}
                </Alert>
            )}
            {!showUnauthorizedBanner && showReconnectBanner && (
                <Alert severity="warning" sx={{flexShrink: 0}}>
                    {t('timing.board.banner.reconnecting')}
                </Alert>
            )}
            {showClockDegradedBanner && (
                <Alert severity="warning" sx={{flexShrink: 0}}>
                    {t('timing.board.banner.clockDegraded')}
                </Alert>
            )}
            {stateError && (
                <Alert severity="error" sx={{flexShrink: 0}}>
                    {t('timing.board.stateError')}
                </Alert>
            )}

            <Box
                sx={{
                    flexGrow: 1,
                    minHeight: 0,
                    display: 'flex',
                    p: 2,
                }}>
                <CaptureButton
                    ref={captureButtonRef}
                    eventId={eventId}
                    station={station}
                    now={clock.now}
                    applyLocalMark={applyLocalMark}
                    markSaved={markSaved}
                    markFailed={markFailed}
                />
            </Box>

            <Box
                sx={{
                    flex: '0 0 33%',
                    minHeight: 0,
                    overflowY: 'auto',
                    borderTop: 1,
                    borderColor: 'divider',
                    px: 2,
                    py: 1,
                }}>
                <MarkList eventId={eventId} marks={marks} />
            </Box>
        </Box>
    )
}

export default TimingBoardPage
