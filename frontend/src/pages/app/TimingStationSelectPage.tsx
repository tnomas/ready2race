import {Box, Card, CardActionArea, Chip, Stack, Typography} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {useNavigate} from '@tanstack/react-router'
import {useEffect} from 'react'
import {useUser} from '@contexts/user/UserContext.ts'
import {useFetch} from '@utils/hooks.ts'
import {getTimingStations} from '@api/sdk.gen.ts'
import {updateAppTimingGlobal} from '@authorization/privileges.ts'
import {timingEventRoute} from '@routes'
import Throbber from '@components/Throbber.tsx'

const TimingStationSelectPage = () => {
    const {t} = useTranslation()
    const user = useUser()
    const navigate = useNavigate()
    const {eventId} = timingEventRoute.useParams()

    useEffect(() => {
        if (!user.checkPrivilege(updateAppTimingGlobal)) {
            void navigate({to: '/app/forbidden'})
        }
    }, [user, navigate])

    const {data: stations, pending} = useFetch(
        signal => getTimingStations({signal, path: {eventId}}),
        {deps: [eventId]},
    )

    return (
        <Box sx={{width: 1, maxWidth: 600}}>
            <Stack spacing={2} sx={{width: 1}}>
                <Typography variant="h4" textAlign="center" gutterBottom>
                    {t('timing.selectStation')}
                </Typography>
                {stations?.map(station => (
                    <Card key={station.id} sx={{minHeight: 96, width: 1}}>
                        <CardActionArea
                            onClick={() =>
                                void navigate({
                                    to: '/app/timing/$eventId/$stationId',
                                    params: {eventId, stationId: station.id},
                                })
                            }
                            sx={{
                                height: 1,
                                minHeight: 96,
                                display: 'flex',
                                flexDirection: 'row',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                px: 3,
                                py: 2,
                            }}>
                            <Typography variant="h6">{station.name}</Typography>
                            <Chip label={t(`timing.station.types.${station.type}`)} color="primary" />
                        </CardActionArea>
                    </Card>
                ))}
                {pending && <Throbber />}
            </Stack>
        </Box>
    )
}

export default TimingStationSelectPage
