import {Box, Card, CardActionArea, Chip, Stack, Typography} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {useNavigate} from '@tanstack/react-router'
import {useEffect} from 'react'
import {useUser} from '@contexts/user/UserContext.ts'
import {useFetch} from '@utils/hooks.ts'
import {getTimingStations} from '@api/sdk.gen.ts'
import {updateAppTimingGlobal, updateEventGlobal} from '@authorization/privileges.ts'
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
                <Typography variant="subtitle2" color="text.secondary">
                    {t('timing.sections.timing')}
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
                            <Chip
                                label={t(`timing.station.types.${station.type}`)}
                                color="primary"
                            />
                        </CardActionArea>
                    </Card>
                ))}
                {user.checkPrivilege(updateEventGlobal) && (
                    <Typography variant="subtitle2" color="text.secondary" sx={{mt: 2}}>
                        {t('timing.sections.other')}
                    </Typography>
                )}
                {/* The Leitstand is not a station: it is the control desk over all of them, and it
                    writes into the event's results — hence the stricter privilege than the operator
                    boards above. */}
                {user.checkPrivilege(updateEventGlobal) && (
                    <Card sx={{minHeight: 96, width: 1}}>
                        <CardActionArea
                            onClick={() =>
                                void navigate({
                                    to: '/app/timing/$eventId/leitstand',
                                    params: {eventId},
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
                            <Typography variant="h6">{t('timing.leitstand.title')}</Typography>
                            <Chip label={t('timing.leitstand.entryHint')} color="secondary" />
                        </CardActionArea>
                    </Card>
                )}
                {/* Kein Schiedsrichter-Eintrag mehr: Die Funktionsauswahl der Helfer-App führt
                    über LIVE_DASHBOARD zum Schiedsrichter-Dashboard, und ein zweiter Weg dorthin aus
                    der Postenauswahl heraus wäre nur ein weiterer Ort, der gepflegt werden muss. */}
                {pending && <Throbber />}
            </Stack>
        </Box>
    )
}

export default TimingStationSelectPage
