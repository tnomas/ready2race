import {Alert, Box} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {useNavigate} from '@tanstack/react-router'
import {useEffect} from 'react'
import {useUser} from '@contexts/user/UserContext.ts'
import {updateAppTimingGlobal} from '@authorization/privileges.ts'
import {timingEventRoute, timingStationRoute} from '@routes'
import BoardHeader from '@components/timing/BoardHeader.tsx'
import {useTimingBoardState} from '@components/timing/useTimingBoardState.ts'
import {useServerClock} from '@utils/timing/useServerClock.ts'

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
    const {marks, stations, wsStatus, stateError} = useTimingBoardState(eventId, stationId)

    const station = stations.find(s => s.id === stationId)

    const showReconnectBanner = wsStatus === 'CONNECTING' || wsStatus === 'RECONNECTING'
    const showUnauthorizedBanner = wsStatus === 'UNAUTHORIZED'
    const showClockDegradedBanner = clock.quality === 'DEGRADED'

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

            {/* Capture area — filled in by Task 8 (two-step capture button). */}
            <Box
                sx={{
                    flexGrow: 1,
                    minHeight: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            />

            {/* Mark list — filled in by Task 8 (MarkList component). Minimal placeholder for now. */}
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
                {marks
                    .slice()
                    .reverse()
                    .map(mark => (
                        <Box key={mark.id} sx={{py: 0.5}}>
                            {new Date(mark.timestampMillis).toLocaleTimeString()} — {mark.status}
                            {mark.pending ? ` (${t('timing.board.mark.pending')})` : ''}
                            {mark.failed ? ` (${t('timing.board.mark.failed')})` : ''}
                        </Box>
                    ))}
            </Box>
        </Box>
    )
}

export default TimingBoardPage
