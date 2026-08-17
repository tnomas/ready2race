import {Box, Button, Stack, Typography} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {useAppSession} from '@contexts/app/AppSessionContext'
import {useUser} from '@contexts/user/UserContext.ts'
import LogoutIcon from '@mui/icons-material/Logout'
import {useNavigate} from '@tanstack/react-router'
import {useEffect} from 'react'
import {updateAppTimingGlobal} from '@authorization/privileges.ts'

// Mirrors QrEventsPage, but timing owns its own eventId as a real route param
// (`/app/timing/$eventId`) instead of the shared AppSessionContext eventId/AppView
// mechanism the QR app functions use.
const TimingEventsPage = () => {
    const {t} = useTranslation()
    const {events} = useAppSession()
    const user = useUser()
    const navigate = useNavigate()

    useEffect(() => {
        if (!user.checkPrivilege(updateAppTimingGlobal)) {
            void navigate({to: '/app/forbidden'})
        }
    }, [user, navigate])

    useEffect(() => {
        if (events && events.length === 1) {
            void navigate({to: '/app/timing/$eventId', params: {eventId: events[0].id}, replace: true})
        }
    }, [events, navigate])

    return (
        (events && (
            <Box sx={{width: 1, maxWidth: 600}}>
                <Stack spacing={2} sx={{width: 1}}>
                    <Typography variant="h4" textAlign="center" gutterBottom>
                        {t('timing.selectEvent')}
                    </Typography>
                    {events.map(event => (
                        <Button
                            key={event.id}
                            onClick={() =>
                                void navigate({
                                    to: '/app/timing/$eventId',
                                    params: {eventId: event.id},
                                })
                            }
                            fullWidth
                            variant="contained"
                            color="primary">
                            {event.name}
                        </Button>
                    ))}
                    <Button
                        onClick={() => 'logout' in user && user.logout(true)}
                        variant="outlined"
                        startIcon={<LogoutIcon />}
                        fullWidth
                        sx={{mt: 4}}>
                        {t('user.settings.logout')}
                    </Button>
                </Stack>
            </Box>
        )) ||
        null
    )
}

export default TimingEventsPage
