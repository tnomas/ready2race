import {Box, Card, Grid2, Stack, Typography} from '@mui/material'
import {alpha} from '@mui/material/styles'
import {useTranslation} from 'react-i18next'
import {useMemo} from 'react'
import {ArrowForward, EventAvailable, Login} from '@mui/icons-material'
import {getPublicEvents} from '@api/sdk.gen.ts'
import {useFeedback, useFetch} from '@utils/hooks.ts'
import {ButtonLink, EmptyState, ErrorState, LoadingState, SectionHeader} from '@components/ui'
import {CONTAINER_RADIUS} from '../theme/adminTheme.ts'
import {primaryTextColor} from '../theme/themeColors.ts'
import LandingEventCard from './LandingEventCard.tsx'
import {groupEventsByPhase, todayIso} from './results/publicEventsLogic.ts'

/** Genug, damit bei mehreren Veranstaltungen die laufenden nicht hinter dem Limit verschwinden. */
const EVENTS_LIMIT = 20

/**
 * Die Startseite für Besucher ohne Anmeldung (angemeldet leitet die Route aufs Dashboard um).
 * Ein Schaufenster statt einer Verwaltungsliste: oben der Einstieg zu Ergebnissen & Live und zur
 * Anmeldung, darunter was gerade läuft und was demnächst ansteht – jeweils mit direktem Weg zu
 * Ergebnissen, Meldung und Details. Datenquelle bleibt die öffentliche Veranstaltungsliste
 * (veröffentlicht und laufend/kommend).
 */
const LandingPage = () => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    const {data, pending, error, reload} = useFetch(
        signal =>
            getPublicEvents({
                signal,
                query: {
                    limit: EVENTS_LIMIT,
                    sort: JSON.stringify([
                        {field: 'EVENT_FROM', direction: 'ASC'},
                        {field: 'EVENT_TO', direction: 'ASC'},
                        {field: 'NAME', direction: 'ASC'},
                    ]),
                },
            }),
        {
            onResponse: ({error}) => {
                if (error) {
                    feedback.error(t('common.load.error.single', {entity: t('event.events')}))
                }
            },
        },
    )

    const groups = useMemo(
        () =>
            groupEventsByPhase(
                data?.data ?? [],
                e => ({from: e.eventFrom, to: e.eventTo}),
                e => e.name,
                todayIso(new Date()),
            ),
        [data],
    )
    // Die öffentliche Liste enthält keine vergangenen; was ohne Termin kommt, steht bei „Demnächst".
    const upcoming = [...groups.upcoming, ...groups.undated, ...groups.past]

    return (
        <Stack spacing={{xs: 4, md: 5}} sx={{pb: 4}}>
            <Box
                component={'section'}
                sx={theme => ({
                    borderRadius: `${CONTAINER_RADIUS}px`,
                    border: `1px solid ${theme.palette.divider}`,
                    px: {xs: 2.5, sm: 4, md: 6},
                    py: {xs: 4, sm: 5, md: 6},
                    background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.12)} 0%, ${theme.palette.background.paper} 70%)`,
                })}>
                <Stack spacing={2} sx={{maxWidth: '44rem'}}>
                    <Typography
                        variant={'overline'}
                        component={'p'}
                        sx={{color: theme => primaryTextColor(theme)}}>
                        {t('landing.hero.overline')}
                    </Typography>
                    <Typography
                        variant={'h1'}
                        sx={{
                            fontSize: {xs: '1.875rem', sm: '2.5rem', md: '2.875rem'},
                            fontWeight: 700,
                            lineHeight: 1.15,
                            letterSpacing: '-0.02em',
                        }}>
                        {t('landing.hero.title')}
                    </Typography>
                    <Typography
                        color={'text.secondary'}
                        sx={{fontSize: {xs: '1rem', sm: '1.125rem'}, maxWidth: '36rem'}}>
                        {t('landing.hero.subtitle')}
                    </Typography>
                    <Stack
                        direction={{xs: 'column', sm: 'row'}}
                        spacing={1.5}
                        sx={{pt: 1, alignItems: {xs: 'stretch', sm: 'center'}}}>
                        <ButtonLink
                            to={'/results'}
                            variant={'contained'}
                            size={'large'}
                            endIcon={<ArrowForward />}>
                            {t('landing.actions.results')}
                        </ButtonLink>
                        <ButtonLink
                            to={'/login'}
                            variant={'outlined'}
                            size={'large'}
                            startIcon={<Login />}>
                            {t('landing.actions.login')}
                        </ButtonLink>
                    </Stack>
                </Stack>
            </Box>

            {pending && !data ? (
                <LoadingState variant={'section'} />
            ) : error && !data ? (
                <Card>
                    <ErrorState onRetry={reload} />
                </Card>
            ) : (data?.data.length ?? 0) === 0 ? (
                <Card>
                    <EmptyState
                        icon={<EventAvailable />}
                        title={t('landing.empty.title')}
                        description={t('landing.empty.description')}
                    />
                </Card>
            ) : (
                <>
                    {groups.running.length > 0 && (
                        <Box component={'section'}>
                            <SectionHeader title={t('landing.sections.running')} />
                            <Grid2 container spacing={2}>
                                {groups.running.map(event => (
                                    <Grid2
                                        key={event.id}
                                        size={{xs: 12, md: groups.running.length > 1 ? 6 : 12}}>
                                        <LandingEventCard event={event} live />
                                    </Grid2>
                                ))}
                            </Grid2>
                        </Box>
                    )}
                    {upcoming.length > 0 && (
                        <Box component={'section'}>
                            <SectionHeader title={t('landing.sections.upcoming')} />
                            <Grid2 container spacing={2}>
                                {upcoming.map(event => (
                                    <Grid2 key={event.id} size={{xs: 12, md: 6}}>
                                        <LandingEventCard event={event} />
                                    </Grid2>
                                ))}
                            </Grid2>
                        </Box>
                    )}
                </>
            )}
        </Stack>
    )
}

export default LandingPage
