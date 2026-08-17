import {Box, Typography} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {useNavigate} from '@tanstack/react-router'
import {useEffect} from 'react'
import {useUser} from '@contexts/user/UserContext.ts'
import {useFetch} from '@utils/hooks.ts'
import {getTimingStations} from '@api/sdk.gen.ts'
import {updateAppTimingGlobal} from '@authorization/privileges.ts'
import {timingEventRoute, timingStationRoute} from '@routes'
import Throbber from '@components/Throbber.tsx'

// Placeholder shell — Task 7 (Plan 2) replaces this with the real board
// (clock, live state, capture area, mark list).
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

    const {data: stations, pending} = useFetch(
        signal => getTimingStations({signal, path: {eventId}}),
        {deps: [eventId]},
    )

    const station = stations?.find(s => s.id === stationId)

    return (
        <Box sx={{width: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2}}>
            {pending && <Throbber />}
            {station && (
                <>
                    <Typography variant="h3" textAlign="center">
                        {station.name}
                    </Typography>
                    <Typography variant="body1" textAlign="center">
                        {t('timing.boardComingSoon')}
                    </Typography>
                </>
            )}
        </Box>
    )
}

export default TimingBoardPage
