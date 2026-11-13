import {Box, Card, CardContent, Chip, Stack, Typography} from '@mui/material'
import {EmojiEventsOutlined, EventAvailable, Flag, HowToReg, LocationOn} from '@mui/icons-material'
import {useTranslation} from 'react-i18next'
import {format} from 'date-fns'
import {EventPublicDto} from '@api/types.gen.ts'
import {getRegistrationPeriods, getRegistrationState} from '@utils/helpers.ts'
import {ButtonLink, TextLink} from '@components/ui'
import {PublicMetaItem} from '@components/results/PublicPageHeader.tsx'
import {formatEventDateRange} from './results/publicEventsLogic.ts'

type Props = {
    event: EventPublicDto
    /** Die Veranstaltung läuft heute: Rahmen in Primärfarbe, „Live"-Marke, Ergebnisse als Hauptaktion. */
    live?: boolean
}

/**
 * Karte einer öffentlichen Veranstaltung auf der Startseite. Führt direkt zu den drei Dingen,
 * die Besucher wollen: Ergebnisse & Live, Meldung (solange offen) und die Detailseite.
 */
const LandingEventCard = ({event, live = false}: Props) => {
    const {t} = useTranslation()

    const dateRange = formatEventDateRange({from: event.eventFrom, to: event.eventTo}, date =>
        format(date, t('format.date')),
    )
    const registrationState = getRegistrationState(event)
    const {registrationPeriod, lateRegistrationPeriod} = getRegistrationPeriods(event, t)
    const registrationOpen = registrationState !== 'CLOSED'

    return (
        <Card
            component={'article'}
            sx={{
                height: 1,
                display: 'flex',
                flexDirection: 'column',
                ...(live && {borderColor: 'primary.main', borderWidth: 2, borderStyle: 'solid'}),
            }}>
            <CardContent
                sx={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1.5,
                    p: {xs: 2, sm: 3},
                }}>
                <Stack direction={'row'} spacing={1} sx={{flexWrap: 'wrap', rowGap: 0.5}}>
                    {live && (
                        <Chip size={'small'} color={'primary'} label={t('landing.status.live')} />
                    )}
                    {registrationOpen && (
                        <Chip
                            size={'small'}
                            color={'success'}
                            icon={<HowToReg />}
                            label={t(
                                registrationState === 'LATE'
                                    ? 'landing.status.lateRegistrationOpen'
                                    : 'landing.status.registrationOpen',
                            )}
                        />
                    )}
                </Stack>
                <Typography
                    component={'h3'}
                    variant={'h2'}
                    sx={{overflowWrap: 'anywhere', fontSize: {xs: '1.25rem', sm: '1.375rem'}}}>
                    <TextLink
                        to={'/event/$eventId'}
                        params={{eventId: event.id}}
                        color={'inherit'}
                        underline={'hover'}>
                        {event.name}
                    </TextLink>
                </Typography>
                <Box sx={{display: 'flex', flexWrap: 'wrap', columnGap: 2, rowGap: 0.5}}>
                    {dateRange && (
                        <PublicMetaItem icon={<EventAvailable />}>{dateRange}</PublicMetaItem>
                    )}
                    {event.location && (
                        <PublicMetaItem icon={<LocationOn />}>{event.location}</PublicMetaItem>
                    )}
                    <PublicMetaItem icon={<Flag />}>
                        {event.competitionCount} {t('event.competition.competitions')}
                    </PublicMetaItem>
                </Box>
                {event.description && (
                    <Typography
                        color={'text.secondary'}
                        sx={{
                            display: '-webkit-box',
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                        }}>
                        {event.description}
                    </Typography>
                )}
                <Box>
                    <Typography
                        variant={'body2'}
                        color={'text.secondary'}
                        sx={registrationState === 'REGULAR' ? {fontWeight: 600} : undefined}>
                        {t('event.registrationAvailable.timespan')}: {registrationPeriod}
                    </Typography>
                    {lateRegistrationPeriod && (
                        <Typography
                            variant={'body2'}
                            color={'text.secondary'}
                            sx={registrationState === 'LATE' ? {fontWeight: 600} : undefined}>
                            {t('event.registrationAvailable.lateTimespan')}:{' '}
                            {lateRegistrationPeriod}
                        </Typography>
                    )}
                </Box>
                <Box sx={{flex: 1}} />
                <Stack
                    direction={'row'}
                    spacing={1}
                    useFlexGap
                    sx={{flexWrap: 'wrap', alignItems: 'center', pt: 0.5}}>
                    <ButtonLink
                        to={'/results/event/$eventId'}
                        params={{eventId: event.id}}
                        variant={live ? 'contained' : 'outlined'}
                        startIcon={<EmojiEventsOutlined />}>
                        {t('landing.actions.results')}
                    </ButtonLink>
                    {registrationOpen && (
                        <ButtonLink
                            to={'/event/$eventId/register'}
                            params={{eventId: event.id}}
                            search={event.challengeEvent ? {tab: 'competitions'} : undefined}
                            variant={live ? 'outlined' : 'contained'}>
                            {t('landing.actions.register')}
                        </ButtonLink>
                    )}
                    <ButtonLink
                        to={'/event/$eventId'}
                        params={{eventId: event.id}}
                        variant={'text'}>
                        {t('landing.actions.details')}
                    </ButtonLink>
                </Stack>
            </CardContent>
        </Card>
    )
}

export default LandingEventCard
