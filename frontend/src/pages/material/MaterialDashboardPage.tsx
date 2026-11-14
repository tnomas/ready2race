import {Box, Chip, IconButton, Stack, Tab, Tooltip} from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import DirectionsBoatOutlined from '@mui/icons-material/DirectionsBoatOutlined'
import {useTranslation} from 'react-i18next'
import {useNavigate} from '@tanstack/react-router'
import {materialEventRoute} from '@routes'
import TabSelectionContainer from '@components/tab/TabSelectionContainer.tsx'
import TabPanel from '@components/tab/TabPanel.tsx'
import {a11yProps} from '@utils/helpers.ts'
import {useFetch} from '@utils/hooks.ts'
import {getEvent} from '@api/sdk.gen.ts'
import {useDocumentTitle} from '@utils/useDocumentTitle.ts'
import {useUser} from '@contexts/user/UserContext.ts'
import {readMaterialGlobal} from '@authorization/privileges.ts'
import {ButtonLink, ErrorState, LoadingState, PageHeader} from '@components/ui'
import {crumbLabel} from '@utils/navigation/breadcrumbs.ts'
import MaterialSettingsPanel from '@components/material/MaterialSettingsPanel.tsx'
import MaterialRequestsPanel from '@components/material/MaterialRequestsPanel.tsx'
import MaterialAssignmentPanel from '@components/material/MaterialAssignmentPanel.tsx'
import MaterialDamagesPanel from '@components/material/MaterialDamagesPanel.tsx'
import MaterialProviderPicker from '@components/material/MaterialProviderPicker.tsx'
import {useMaterialOverview} from '@components/material/useMaterialOverview.ts'
import {useMaterialConflicts} from '@components/material/useMaterialConflicts.ts'
import {assignmentWork, requestFilterCounts} from '@components/material/materialWorkplace.ts'
import {effectiveProviderId, MaterialTab, resolveMaterialTab} from './materialDashboardLogic.ts'

/**
 * Arbeitsplatz des Materialanbieters für eine Veranstaltung. Die Übersicht wird hier EINMAL
 * geladen und an alle Reiter gereicht; die Reiterköpfe zählen die offene Arbeit (offene Anfragen,
 * Teams ohne Stück). Reiter stehen als `?tab=` in der Adresse (ADR-0103).
 */
const MaterialDashboardPage = () => {
    const {t} = useTranslation()
    const user = useUser()
    const navigate = useNavigate()

    const {eventId} = materialEventRoute.useParams()
    const search = materialEventRoute.useSearch()
    const activeTab = resolveMaterialTab(search.tab)

    const mayReadGlobal = user.checkPrivilege(readMaterialGlobal)
    const providerId = effectiveProviderId({
        ownProviderId: user.loggedIn ? user.materialProviderId : undefined,
        mayReadGlobal,
        searchProvider: search.provider,
    })
    // Der gewählte Anbieter reist in Links mit, damit globale Konten nicht neu wählen müssen.
    const providerSearch = search.provider ? {provider: search.provider} : {}

    const switchTab = (tab: MaterialTab) => {
        void navigate({from: materialEventRoute.fullPath, search: prev => ({...prev, tab})})
    }

    const {data: event} = useFetch(signal => getEvent({signal, path: {eventId}}), {
        deps: [eventId],
    })
    useDocumentTitle(event?.name, t('material.material'))

    const overviewState = useMaterialOverview({eventId, providerId})
    const {overview, pending, error, reload} = overviewState
    const conflicts = useMaterialConflicts(overview)

    const openRequests = requestFilterCounts(overview?.requests ?? []).OPEN
    const work = assignmentWork(overview?.requests ?? [], conflicts)
    const assignmentOpen = work.unassigned + work.withConflicts

    const tabLabel = (label: string, count: number) => (count > 0 ? `${label} (${count})` : label)

    return (
        <Box>
            <PageHeader
                title={event?.name ?? t('material.material')}
                subtitle={t('material.dashboard.subtitle')}
                meta={
                    overview?.requestsClosed && (
                        <Chip size={'small'} label={t('event.material.closed')} />
                    )
                }
                breadcrumbs={[
                    {
                        label: t('navigation.titles.material'),
                        link: {to: '/material', search: providerSearch},
                    },
                    {label: crumbLabel(event?.name)},
                ]}
                actions={
                    providerId && (
                        <Stack direction={'row'} spacing={1} alignItems={'center'}>
                            <Tooltip title={t('material.requests.reload')}>
                                <span>
                                    <IconButton
                                        aria-label={t('material.requests.reload')}
                                        onClick={reload}
                                        disabled={pending}
                                        sx={{cursor: 'pointer'}}>
                                        <RefreshIcon />
                                    </IconButton>
                                </span>
                            </Tooltip>
                            <ButtonLink
                                to={'/material/fleet'}
                                search={providerSearch}
                                variant={'outlined'}
                                startIcon={<DirectionsBoatOutlined />}>
                                {t('material.fleet.title')}
                            </ButtonLink>
                        </Stack>
                    )
                }
            />
            {!providerId ? (
                <MaterialProviderPicker
                    mayReadGlobal={mayReadGlobal}
                    onSelect={provider =>
                        void navigate({
                            from: materialEventRoute.fullPath,
                            search: prev => ({...prev, provider}),
                        })
                    }
                />
            ) : error && !overview ? (
                <ErrorState
                    message={t('common.load.error.single', {entity: t('material.material')})}
                    onRetry={reload}
                />
            ) : !overview ? (
                <LoadingState variant={'section'} />
            ) : (
                <>
                    <TabSelectionContainer activeTab={activeTab} setActiveTab={switchTab}>
                        <Tab
                            label={tabLabel(t('material.dashboard.tabs.requests'), openRequests)}
                            {...a11yProps('material', 'requests')}
                        />
                        <Tab
                            label={tabLabel(
                                t('material.dashboard.tabs.assignment'),
                                assignmentOpen,
                            )}
                            {...a11yProps('material', 'assignment')}
                        />
                        <Tab
                            label={t('material.dashboard.tabs.damages')}
                            {...a11yProps('material', 'damages')}
                        />
                        <Tab
                            label={t('material.dashboard.tabs.settings')}
                            {...a11yProps('material', 'settings')}
                        />
                    </TabSelectionContainer>
                    <Box sx={{pt: 2}}>
                        <TabPanel index={'requests'} activeTab={activeTab}>
                            <MaterialRequestsPanel
                                eventId={eventId}
                                providerId={providerId}
                                overview={overview}
                                reload={reload}
                            />
                        </TabPanel>
                        <TabPanel index={'assignment'} activeTab={activeTab}>
                            <MaterialAssignmentPanel
                                eventId={eventId}
                                providerId={providerId}
                                overview={overview}
                                conflicts={conflicts}
                                reload={reload}
                            />
                        </TabPanel>
                        <TabPanel index={'damages'} activeTab={activeTab}>
                            <MaterialDamagesPanel
                                eventId={eventId}
                                providerId={providerId}
                                overview={overview}
                                reloadOverview={reload}
                            />
                        </TabPanel>
                        <TabPanel index={'settings'} activeTab={activeTab}>
                            <MaterialSettingsPanel
                                eventId={eventId}
                                providerId={providerId}
                                requestsClosed={overview.requestsClosed}
                                reload={reload}
                            />
                        </TabPanel>
                    </Box>
                </>
            )}
        </Box>
    )
}

export default MaterialDashboardPage
