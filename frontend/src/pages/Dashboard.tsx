import {Box, Grid2} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {PageHeader} from '@components/ui'
import {useUser} from '@contexts/user/UserContext.ts'
import {useMemo} from 'react'
import {UpcomingEventsWidget} from '@components/dashboard/UpcomingEventsWidget.tsx'
import {EventRegistrationsWidget} from '@components/dashboard/EventRegistrationsWidget.tsx'
import {readRegistrationGlobal} from '@authorization/privileges.ts'
import {TasksWidget} from '@components/dashboard/TasksWidget.tsx'
import {ShiftWidget} from '@components/dashboard/ShiftWidget.tsx'
import {CurrentEventsWidget} from '@components/dashboard/CurrentEventsWidget.tsx'

import PendingClubRepresentativeAlert from '@components/user/PendingClubRepresentativeAlert.tsx'

const Dashboard = () => {
    const {t} = useTranslation()
    const user = useUser()

    const {userId, clubId, registrationReadPrivilege, eventReadPrivilege, eventReadAny} =
        useMemo(() => {
            return {
                userId: user.loggedIn && user.id,
                // Irgendein Leserecht auf Veranstaltungen (auch OWN, etwa Vereinsvertretungen)
                eventReadAny:
                    user.loggedIn && user.getPrivilegeScope('READ', 'EVENT') !== undefined,
                clubId: user.loggedIn && user.clubId,
                registrationReadPrivilege: user.checkPrivilege(readRegistrationGlobal),
                eventReadPrivilege: user.loggedIn
                    ? user.clubId === undefined &&
                      user.getPrivilegeScope('READ', 'EVENT') !== undefined
                    : false,
            }
        }, [user])

    return (
        <Box>
            <PageHeader title={t('navigation.titles.dashboard')} />
            <Grid2
                container
                spacing={{xs: 1.5, lg: 3}}
                alignContent={'flex-start'}
                alignItems={'stretch'}>
                <PendingClubRepresentativeAlert gridItem />
                {/* Reihenfolge: erst der Einstieg in die Veranstaltungen, dann was die Person
                    selbst zu tun hat (Aufgaben, Schichten), dann Neues (Anmeldungen); Vereine
                    sehen gleich danach die offenen Meldestrecken. */}
                {eventReadAny && <CurrentEventsWidget />}
                {clubId && <UpcomingEventsWidget />}
                {userId && eventReadPrivilege && (
                    <>
                        <TasksWidget userId={userId} />
                        <ShiftWidget userId={userId} />
                    </>
                )}
                {registrationReadPrivilege && <EventRegistrationsWidget />}
            </Grid2>
        </Box>
    )
}

export default Dashboard
