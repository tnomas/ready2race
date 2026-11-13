import {Box, Card, Chip, Stack, Typography} from '@mui/material'
import {useFeedback, useFetch} from '@utils/hooks.ts'
import {getEvents} from '@api/sdk.gen.ts'
import {useTranslation} from 'react-i18next'
import {format} from 'date-fns'
import {useMemo} from 'react'
import {ArrowBack, ChevronRight, EventAvailable, LocationOn} from '@mui/icons-material'
import {EventDto} from '@api/types.gen.ts'
import {EmptyState, IconButtonLink, LoadingState, SectionHeader} from '@components/ui'
import PublicPageHeader, {PublicMetaItem} from '@components/results/PublicPageHeader.tsx'
import {CardActionAreaLink} from '@components/results/CardActionAreaLink.tsx'
import {
    EventPhase,
    formatEventDateRange,
    groupEventsByPhase,
    todayIso,
} from './publicEventsLogic.ts'

const PHASES: {key: EventPhase; labelKey: `results.select.${EventPhase}`}[] = [
    {key: 'running', labelKey: 'results.select.running'},
    {key: 'upcoming', labelKey: 'results.select.upcoming'},
    {key: 'past', labelKey: 'results.select.past'},
    {key: 'undated', labelKey: 'results.select.undated'},
]

/**
 * Auswahl „Ergebnisse & Live": Zuschauer suchen fast immer die Veranstaltung, die gerade läuft.
 * Deshalb stehen die laufenden oben und hervorgehoben, darunter die kommenden und vergangenen –
 * statt einer alphabetischen Knopfliste.
 */
const SelectResultsEventPage = () => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const {data, pending} = useFetch(signal => getEvents({signal}), {
        onResponse: response => {
            if (response.error) {
                feedback.error(t('common.load.error.multiple.short', {entity: t('event.event')}))
            }
        },
        deps: [],
    })

    const groups = useMemo(
        () =>
            groupEventsByPhase(
                data?.data ?? [],
                e => ({from: e.firstEventDay, to: e.lastEventDay}),
                e => e.name,
                todayIso(new Date()),
            ),
        [data],
    )
    const total = data?.data.length ?? 0

    return (
        <Box>
            <PublicPageHeader
                back={
                    <IconButtonLink to={'/'} aria-label={t('results.select.home')}>
                        <ArrowBack />
                    </IconButtonLink>
                }
                title={t('landing.liveEventsLink')}
                meta={<Typography variant={'body2'}>{t('results.select.subtitle')}</Typography>}
            />
            {pending && !data ? (
                <LoadingState variant={'section'} />
            ) : total === 0 ? (
                <Card>
                    <EmptyState icon={<EventAvailable />} title={t('results.noEvents')} />
                </Card>
            ) : (
                <Stack spacing={4}>
                    {PHASES.filter(phase => groups[phase.key].length > 0).map(phase => (
                        <Box component={'section'} key={phase.key}>
                            <SectionHeader title={t(phase.labelKey)} />
                            <Stack spacing={1.5}>
                                {groups[phase.key].map(event => (
                                    <EventChoiceCard
                                        key={event.id}
                                        event={event}
                                        live={phase.key === 'running'}
                                    />
                                ))}
                            </Stack>
                        </Box>
                    ))}
                </Stack>
            )}
        </Box>
    )
}

const EventChoiceCard = ({event, live}: {event: EventDto; live: boolean}) => {
    const {t} = useTranslation()
    const dateRange = formatEventDateRange(
        {from: event.firstEventDay, to: event.lastEventDay},
        date => format(date, t('format.date')),
    )
    return (
        <Card
            sx={
                live
                    ? {borderColor: 'primary.main', borderWidth: 2, borderStyle: 'solid'}
                    : undefined
            }>
            <CardActionAreaLink
                to={'/results/event/$eventId'}
                params={{eventId: event.id}}
                sx={{cursor: 'pointer'}}>
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                        px: {xs: 2, sm: 2.5},
                        py: live ? 2.5 : 2,
                    }}>
                    <Box sx={{flex: 1, minWidth: 0}}>
                        <Stack
                            direction={'row'}
                            spacing={1}
                            sx={{alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5}}>
                            <Typography
                                component={'h3'}
                                variant={live ? 'h2' : 'h3'}
                                sx={{overflowWrap: 'anywhere'}}>
                                {event.name}
                            </Typography>
                            {live && (
                                <Chip
                                    size={'small'}
                                    color={'primary'}
                                    label={t('landing.status.live')}
                                />
                            )}
                        </Stack>
                        {(dateRange || event.location) && (
                            <Box
                                sx={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    columnGap: 2,
                                    rowGap: 0.5,
                                    mt: 0.75,
                                }}>
                                {dateRange && (
                                    <PublicMetaItem icon={<EventAvailable />}>
                                        {dateRange}
                                    </PublicMetaItem>
                                )}
                                {event.location && (
                                    <PublicMetaItem icon={<LocationOn />}>
                                        {event.location}
                                    </PublicMetaItem>
                                )}
                            </Box>
                        )}
                    </Box>
                    <ChevronRight aria-hidden sx={{color: 'text.secondary', flexShrink: 0}} />
                </Box>
            </CardActionAreaLink>
        </Card>
    )
}

export default SelectResultsEventPage
