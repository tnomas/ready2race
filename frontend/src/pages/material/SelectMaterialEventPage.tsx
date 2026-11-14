import {Box, Chip, Divider, Paper, Stack, Typography} from '@mui/material'
import EventBusyOutlined from '@mui/icons-material/EventBusyOutlined'
import DirectionsBoatOutlined from '@mui/icons-material/DirectionsBoatOutlined'
import ChevronRight from '@mui/icons-material/ChevronRight'
import {useTranslation} from 'react-i18next'
import {useNavigate} from '@tanstack/react-router'
import {materialIndexRoute} from '@routes'
import {useUser} from '@contexts/user/UserContext.ts'
import {readMaterialGlobal} from '@authorization/privileges.ts'
import {useFetch} from '@utils/hooks.ts'
import {getMaterialProviderEvents} from '@api/sdk.gen.ts'
import {
    ButtonLink,
    EmptyState,
    ErrorState,
    ListItemButtonLink,
    LoadingState,
    PageHeader,
} from '@components/ui'
import MaterialProviderPicker from '@components/material/MaterialProviderPicker.tsx'
import {effectiveProviderId} from './materialDashboardLogic.ts'

/**
 * Einstieg des Materialanbieters: die Veranstaltungen, zu denen der Anbieter eingeladen ist, und
 * der Weg zur Flotte. Konten mit READ MATERIAL GLOBAL ohne eigene Zuordnung wählen zuerst einen
 * Anbieter (`?provider=`).
 */
const SelectMaterialEventPage = () => {
    const {t} = useTranslation()
    const user = useUser()
    const search = materialIndexRoute.useSearch()
    const navigate = useNavigate()

    const mayReadGlobal = user.checkPrivilege(readMaterialGlobal)
    const providerId = effectiveProviderId({
        ownProviderId: user.loggedIn ? user.materialProviderId : undefined,
        mayReadGlobal,
        searchProvider: search.provider,
    })
    const providerSearch = search.provider ? {provider: search.provider} : {}

    const {
        data: events,
        pending,
        error,
        reload,
    } = useFetch(
        signal => getMaterialProviderEvents({signal, path: {providerId: providerId ?? ''}}),
        {
            preCondition: () => providerId !== undefined,
            deps: [providerId],
        },
    )

    return (
        <Box>
            <PageHeader
                title={t('navigation.titles.material')}
                subtitle={t('material.events.subtitle')}
                actions={
                    providerId && (
                        <ButtonLink
                            to={'/material/fleet'}
                            search={providerSearch}
                            variant={'outlined'}
                            startIcon={<DirectionsBoatOutlined />}>
                            {t('material.fleet.title')}
                        </ButtonLink>
                    )
                }
            />
            {providerId === undefined ? (
                <MaterialProviderPicker
                    mayReadGlobal={mayReadGlobal}
                    onSelect={provider =>
                        void navigate({from: materialIndexRoute.fullPath, search: {provider}})
                    }
                />
            ) : error && !events ? (
                <ErrorState
                    message={t('common.load.error.multiple.short', {entity: t('event.events')})}
                    onRetry={reload}
                />
            ) : pending && !events ? (
                <LoadingState variant={'section'} />
            ) : (events?.length ?? 0) === 0 ? (
                <EmptyState icon={<EventBusyOutlined />} title={t('material.events.none')} />
            ) : (
                <Paper variant={'outlined'} sx={{maxWidth: 720}}>
                    <Stack divider={<Divider flexItem />}>
                        {events?.map(event => (
                            <ListItemButtonLink
                                key={event.event}
                                to={'/material/event/$eventId'}
                                params={{eventId: event.event}}
                                search={providerSearch}
                                sx={{cursor: 'pointer', py: 1.5, gap: 1}}>
                                <Typography sx={{flex: 1, minWidth: 0, overflowWrap: 'anywhere'}}>
                                    {event.eventName}
                                </Typography>
                                <Chip
                                    size={'small'}
                                    variant={'outlined'}
                                    color={event.requestsClosed ? 'default' : 'success'}
                                    label={
                                        event.requestsClosed
                                            ? t('event.material.closed')
                                            : t('material.events.open')
                                    }
                                />
                                <ChevronRight color={'action'} />
                            </ListItemButtonLink>
                        ))}
                    </Stack>
                </Paper>
            )}
        </Box>
    )
}

export default SelectMaterialEventPage
