import {ReactNode} from 'react'
import {
    Box,
    Card,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    Stack,
    Typography,
} from '@mui/material'
import PlaceIcon from '@mui/icons-material/Place'
import AccessTimeIcon from '@mui/icons-material/AccessTime'
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty'
import PlayCircleOutlined from '@mui/icons-material/PlayCircleOutlined'
import WorkspacePremiumOutlined from '@mui/icons-material/WorkspacePremiumOutlined'
import {format} from 'date-fns'
import {useTranslation} from 'react-i18next'
import {EventDto} from '@api/types.gen.ts'
import {updateEventGlobal} from '@authorization/privileges.ts'
import {useUser} from '@contexts/user/UserContext.ts'
import {getRegistrationPeriods} from '@utils/helpers.ts'
import {ButtonLink, SectionHeader} from '@components/ui'
import EventNoticeCard from '@components/eventNotice/EventNoticeCard.tsx'

type Props = {
    event: EventDto
    reloadEvent: () => void
    /** Ob der Bereich „Betrieb" für die Person sichtbar ist (dann die Verweiskarte „Renntag"). */
    showRaceDay: boolean
    /** Ob der Bereich „Ergebnisse & Urkunden" sichtbar ist. */
    showResults: boolean
}

/**
 * Bereich „Übersicht": Stammdaten, Hinweis für alle Anzeigen und Verweise in die Bereiche.
 *
 * Bis zum 13.11.2026 trug die Übersicht zusätzlich die Karten „Öffentliche Anzeigen" und
 * „Schiedsrichter-Dashboard" — Doppel der Betrieb-Kacheln unter anderen Namen (UX-02) — und die
 * Ergebnis-/Urkunden-Knöpfe. Die Renntag-Ziele liegen im Betrieb, die Ergebnisse im Bereich
 * „Ergebnisse & Urkunden"; hier stehen nur noch die Wege dorthin.
 */
const OverviewTab = ({event, reloadEvent, showRaceDay, showResults}: Props) => {
    const {t} = useTranslation()
    const user = useUser()
    const eventId = event.id

    const {registrationPeriod, lateRegistrationPeriod} = getRegistrationPeriods(event, t)
    const hasRegistrationPeriod = Boolean(
        event.registrationAvailableFrom || event.registrationAvailableTo,
    )
    const hasDetails = Boolean(
        event.description || event.location || hasRegistrationPeriod || event.paymentDueBy,
    )

    const linkCard = (
        icon: ReactNode,
        title: string,
        description: string,
        tab: 'betrieb' | 'results',
        label: string,
    ) => (
        <Card sx={{p: 2, display: 'flex', flexDirection: 'column'}}>
            <Stack direction={'row'} spacing={1} alignItems={'flex-start'} sx={{flexGrow: 1}}>
                {icon}
                <SectionHeader level={3} title={title} description={description} />
            </Stack>
            <Box>
                <ButtonLink
                    to={'/event/$eventId'}
                    params={{eventId}}
                    search={{tab}}
                    variant={'outlined'}>
                    {label}
                </ButtonLink>
            </Box>
        </Card>
    )

    return (
        <Stack spacing={3}>
            {hasDetails && (
                <Card sx={{p: 2, display: 'flex', flexDirection: 'column', gap: 1}}>
                    {event.description && (
                        <Typography sx={{whiteSpace: 'pre-line'}}>{event.description}</Typography>
                    )}
                    <List disablePadding>
                        {event.location && (
                            <ListItem>
                                <ListItemIcon>
                                    <PlaceIcon />
                                </ListItemIcon>
                                <ListItemText primary={event.location} />
                            </ListItem>
                        )}
                        {hasRegistrationPeriod && (
                            <ListItem>
                                <ListItemIcon>
                                    <AccessTimeIcon />
                                </ListItemIcon>
                                <ListItemText
                                    primary={
                                        t('event.registrationAvailable.timespan') +
                                        ': ' +
                                        registrationPeriod
                                    }
                                    secondary={
                                        lateRegistrationPeriod &&
                                        t('event.registrationAvailable.lateTimespan') +
                                            ': ' +
                                            lateRegistrationPeriod
                                    }
                                />
                            </ListItem>
                        )}
                        {event.paymentDueBy && (
                            <ListItem>
                                <ListItemIcon>
                                    <HourglassEmptyIcon />
                                </ListItemIcon>
                                <ListItemText
                                    primary={
                                        t('event.invoice.paymentDueBy') +
                                        ': ' +
                                        format(new Date(event.paymentDueBy), t('format.datetime'))
                                    }
                                />
                            </ListItem>
                        )}
                    </List>
                </Card>
            )}
            {/* Globaler Hinweis (z.B. Wetterwarnung): erscheint auf allen öffentlichen Anzeigen
                und im Schiedsrichter-Dashboard. */}
            {user.checkPrivilege(updateEventGlobal) && (
                <EventNoticeCard eventId={eventId} notice={event.notice} onChanged={reloadEvent} />
            )}
            {(showRaceDay || showResults) && (
                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: {
                            xs: '1fr',
                            md: showRaceDay && showResults ? '1fr 1fr' : '1fr',
                        },
                        gap: 2,
                    }}>
                    {showRaceDay &&
                        linkCard(
                            <PlayCircleOutlined color={'primary'} sx={{mt: 0.25}} />,
                            t('event.overview.raceDay.title'),
                            t('event.overview.raceDay.description'),
                            'betrieb',
                            t('event.overview.raceDay.open'),
                        )}
                    {showResults &&
                        linkCard(
                            <WorkspacePremiumOutlined color={'primary'} sx={{mt: 0.25}} />,
                            t('nav.event.sections.results'),
                            t('event.overview.results.description'),
                            'results',
                            t('event.overview.results.open'),
                        )}
                </Box>
            )}
        </Stack>
    )
}

export default OverviewTab
