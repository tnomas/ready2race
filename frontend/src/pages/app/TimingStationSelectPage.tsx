import {Box, Card, CardActionArea, Chip, Stack, Typography} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {useNavigate} from '@tanstack/react-router'
import {useEffect} from 'react'
import {useUser} from '@contexts/user/UserContext.ts'
import {useFetch} from '@utils/hooks.ts'
import {getTimingStations} from '@api/sdk.gen.ts'
import {
    updateAppCompetitionCheckGlobal,
    updateAppTimingGlobal,
    updateEventGlobal,
} from '@authorization/privileges.ts'
import {timingEventRoute} from '@routes'
import Throbber from '@components/Throbber.tsx'
import {useAppSession} from '@contexts/app/AppSessionContext.tsx'

const TimingStationSelectPage = () => {
    const {t} = useTranslation()
    const user = useUser()
    const navigate = useNavigate()
    const {eventId} = timingEventRoute.useParams()
    const {setEventId, setAppFunction, navigateTo} = useAppSession()

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
                            <Chip label={t(`timing.station.types.${station.type}`)} color="primary" />
                        </CardActionArea>
                    </Card>
                ))}
                {(user.checkPrivilege(updateEventGlobal) ||
                    user.checkPrivilege(updateAppCompetitionCheckGlobal)) && (
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
                {/* Schiedsrichter is not a timing station either: it re-uses the existing
                    Wettkampf-Check app function (competition-check flow) for this same event.
                    We hand the event over via AppSessionContext (setEventId + setAppFunction),
                    the same mechanism the QR event list uses, then navigate into the shared
                    scanner entry point. */}
                {user.checkPrivilege(updateAppCompetitionCheckGlobal) && (
                    <Card sx={{minHeight: 96, width: 1}}>
                        <CardActionArea
                            onClick={() => {
                                setEventId(eventId)
                                setAppFunction('APP_COMPETITION_CHECK')
                                navigateTo('APP_Scanner')
                            }}
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
                            <Typography variant="h6">{t('timing.referee.title')}</Typography>
                            <Chip
                                label={t('app.functionSelect.functions.competitionCheck')}
                                color="secondary"
                            />
                        </CardActionArea>
                    </Card>
                )}
                {pending && <Throbber />}
            </Stack>
        </Box>
    )
}

export default TimingStationSelectPage
