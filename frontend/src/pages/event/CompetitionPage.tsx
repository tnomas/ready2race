import {lazy, Suspense, useMemo, useState} from 'react'
import {Box, Button, Chip, Tab} from '@mui/material'
import EditOutlined from '@mui/icons-material/EditOutlined'
import {format, parseISO} from 'date-fns'
import {useTranslation} from 'react-i18next'
import {useNavigate} from '@tanstack/react-router'
import {competitionIndexRoute, competitionRoute, eventRoute} from '@routes'
import {getCompetition, getEvent, getEventDays} from '@api/sdk.gen.ts'
import {CompetitionDto} from '@api/types.gen.ts'
import {useUser} from '@contexts/user/UserContext.ts'
import {useEntityAdministration, useFeedback, useFetch} from '@utils/hooks.ts'
import {a11yProps, getRegistrationState} from '@utils/helpers.ts'
import {useDocumentTitle} from '@utils/useDocumentTitle.ts'
import {loadChunk} from '@utils/chunkReload.ts'
import {buildEventTrail} from '@utils/navigation/breadcrumbs.ts'
import {AutocompleteOption} from '@utils/types.ts'
import {ErrorState, LoadingState, PageHeader} from '@components/ui'
import TabSelectionContainer from '@components/tab/TabSelectionContainer'
import {eventDayName} from '@components/event/common.ts'
import {competitionLabelName, CompetitionTab} from '@components/event/competition/common.ts'
import CompetitionNavigation from '@components/event/competition/CompetitionNavigation.tsx'
import CompetitionDialog from '@components/event/competition/CompetitionDialog.tsx'
import {EVENT_SECTIONS} from './eventSections.ts'
import {
    canEditCompetition,
    COMPETITION_TAB_LABEL_KEYS,
    competitionCrumbLabel,
    competitionTabSearch,
    resolveCompetitionTab,
    visibleCompetitionTabs,
} from './competitionPageLogic.ts'
import CompetitionGeneralTab from './CompetitionGeneralTab.tsx'

// Die Arbeitsreiter (Durchführung mit Lauf-Karten, Rundenstruktur-Editor, Meldungs- und
// Teamtabellen) laden erst, wenn sie gezeigt werden.
const CompetitionRegistrations = lazy(() =>
    loadChunk(
        () => import('@components/event/competition/registration/CompetitionRegistrations.tsx'),
    ),
)
const CompetitionRegistrationTeams = lazy(() =>
    loadChunk(
        () => import('@components/event/competition/registration/CompetitionRegistrationTeams.tsx'),
    ),
)
const CompetitionSetupForEvent = lazy(() =>
    loadChunk(() => import('@components/event/competition/setup/CompetitionSetupForEvent.tsx')),
)
const CompetitionExecution = lazy(() =>
    loadChunk(() => import('@components/event/competition/excecution/CompetitionExecution.tsx')),
)
const CompetitionTimingConfig = lazy(() =>
    loadChunk(() => import('@components/event/competition/timing/CompetitionTimingConfig.tsx')),
)
const CompetitionPlaces = lazy(() =>
    loadChunk(() => import('@components/event/competition/excecution/CompetitionPlaces.tsx')),
)

const competitionsSection = EVENT_SECTIONS.find(s => s.key === 'competitions')

const CompetitionPage = () => {
    const {t} = useTranslation()
    const feedback = useFeedback()
    const user = useUser()
    const navigate = useNavigate()

    const {eventId} = eventRoute.useParams()
    const {competitionId} = competitionRoute.useParams()
    const {tab} = competitionIndexRoute.useSearch()

    const {
        data: eventData,
        error: eventError,
        reload: reloadEvent,
    } = useFetch(signal => getEvent({signal, path: {eventId}}), {deps: [eventId]})

    // Zähler statt Schalter: jede Änderung (Tag-Zuordnung, Bearbeiten) lädt Wettkampf und Tage neu.
    const [dataVersion, setDataVersion] = useState(0)
    const reloadData = () => setDataVersion(v => v + 1)

    const {
        data: competitionData,
        error: competitionError,
        reload: reloadCompetition,
    } = useFetch(signal => getCompetition({signal, path: {eventId, competitionId}}), {
        deps: [eventId, competitionId, dataVersion],
    })

    const {data: assignedEventDaysData, pending: assignedEventDaysPending} = useFetch(
        signal => getEventDays({signal, path: {eventId}, query: {competitionId}}),
        {
            onResponse: ({error}) => {
                if (error) {
                    feedback.error(
                        t('common.load.error.multiple.short', {
                            entity: t('event.eventDay.eventDays'),
                        }),
                    )
                }
            },
            deps: [eventId, competitionId, dataVersion],
        },
    )

    const {data: eventDaysData, pending: eventDaysPending} = useFetch(
        signal => getEventDays({signal, path: {eventId}}),
        {
            onResponse: ({error}) => {
                if (error) {
                    feedback.error(
                        t('common.load.error.multiple.short', {
                            entity: t('event.eventDay.eventDays'),
                        }),
                    )
                }
            },
            deps: [eventId, dataVersion],
        },
    )

    useDocumentTitle(competitionData?.properties.name, eventData?.name)

    const competitionAdministration = useEntityAdministration<CompetitionDto>(
        t('event.competition.competition'),
    )

    const visible = useMemo(
        () =>
            eventData && competitionData
                ? visibleCompetitionTabs(user, {
                      challengeEvent: eventData.challengeEvent,
                      registrationCount: eventData.registrationCount ?? 0,
                      registrationState: getRegistrationState(
                          eventData,
                          competitionData.properties.lateRegistrationAllowed,
                      ),
                  })
                : [],
        [user, eventData, competitionData],
    )
    const activeTab = resolveCompetitionTab(tab, visible)

    const switchTab = (next: CompetitionTab) => {
        navigate({
            to: '/event/$eventId/competition/$competitionId',
            params: {eventId, competitionId},
            search: competitionTabSearch(next),
        }).then()
    }

    const breadcrumbs = buildEventTrail({
        eventsLabel: t('navigation.titles.events'),
        eventId,
        eventName: eventData?.name,
        section: competitionsSection
            ? {tab: competitionsSection.key, label: t(competitionsSection.labelKey)}
            : undefined,
        trail: competitionData ? [{label: competitionCrumbLabel(competitionData.properties)}] : [],
    })

    if (!eventData || !competitionData) {
        const error = competitionError ?? eventError
        if (error) {
            return (
                <Box>
                    <PageHeader
                        title={t('event.competition.competition')}
                        breadcrumbs={breadcrumbs}
                    />
                    <ErrorState
                        message={
                            error.status === 404 || error.status === 403
                                ? t('event.competition.page.notFound')
                                : t('event.competition.page.loadError')
                        }
                        onRetry={() => {
                            if (eventError) reloadEvent()
                            if (competitionError) reloadCompetition()
                        }}
                    />
                </Box>
            )
        }
        return <LoadingState variant={'page'} />
    }

    const properties = competitionData.properties

    const dayOptions: AutocompleteOption[] | undefined = eventDaysData?.data.map(value => ({
        id: value.id,
        label: eventDayName(value.date, value.name),
    }))
    const assignedDays = assignedEventDaysData?.data ?? []

    const subtitleParts = [
        properties.shortName,
        properties.competitionCategory?.name,
        assignedDays.length > 0
            ? assignedDays
                  .map(d => d.date)
                  .sort()
                  .map(date => format(parseISO(date), t('format.date')))
                  .join(', ')
            : undefined,
    ].filter((part): part is string => Boolean(part))

    const withLateRegistration = Boolean(
        eventData.lateRegistrationAvailableTo && properties.lateRegistrationAllowed,
    )

    const mayEdit = canEditCompetition(user.checkPrivilege)

    const panel = (() => {
        switch (activeTab) {
            case 'general':
                return (
                    <CompetitionGeneralTab
                        event={eventData}
                        competition={competitionData}
                        dayOptions={dayOptions}
                        assignedDayIds={assignedEventDaysData?.data.map(d => d.id)}
                        daysPending={eventDaysPending || assignedEventDaysPending}
                        reloadDays={reloadData}
                    />
                )
            case 'registrations':
                return (
                    <CompetitionRegistrations
                        eventData={eventData}
                        competitionData={competitionData}
                        reloadEvent={reloadEvent}
                    />
                )
            case 'teams':
                return (
                    <CompetitionRegistrationTeams
                        eventData={eventData}
                        competitionData={competitionData}
                    />
                )
            case 'setup':
                return <CompetitionSetupForEvent />
            case 'timing':
                return <CompetitionTimingConfig />
            case 'execution':
                return (
                    <CompetitionExecution
                        autoRefresh={{
                            enabled: eventData.executionAutoRefresh,
                            seconds: eventData.executionAutoRefreshSeconds,
                        }}
                    />
                )
            case 'places':
                return <CompetitionPlaces />
        }
    })()

    const tabProps = (value: CompetitionTab) => a11yProps('competition', value)

    return (
        <Box>
            <CompetitionNavigation
                eventId={eventId}
                competitionId={competitionId}
                activeTab={activeTab}
                listVersion={dataVersion}
                header={navigation => (
                    <PageHeader
                        title={competitionLabelName(properties.identifier, properties.name)}
                        subtitle={subtitleParts.length > 0 ? subtitleParts.join(' · ') : undefined}
                        meta={
                            withLateRegistration ? (
                                <Chip
                                    size={'small'}
                                    variant={'outlined'}
                                    label={t('event.competition.lateRegistrationAllowed')}
                                />
                            ) : undefined
                        }
                        breadcrumbs={breadcrumbs}
                        actions={
                            navigation || mayEdit ? (
                                <>
                                    {navigation}
                                    {mayEdit && (
                                        <Button
                                            variant={'outlined'}
                                            startIcon={<EditOutlined />}
                                            sx={{cursor: 'pointer'}}
                                            onClick={() =>
                                                competitionAdministration.table.openDialog(
                                                    competitionData,
                                                )
                                            }>
                                            {t('common.edit')}
                                        </Button>
                                    )}
                                </>
                            ) : undefined
                        }
                    />
                )}>
                {visible.length > 1 && (
                    <TabSelectionContainer activeTab={activeTab} setActiveTab={switchTab}>
                        {visible.map(value => (
                            <Tab
                                key={value}
                                label={t(COMPETITION_TAB_LABEL_KEYS[value])}
                                {...tabProps(value)}
                            />
                        ))}
                    </TabSelectionContainer>
                )}
                <Box
                    role={visible.length > 1 ? 'tabpanel' : undefined}
                    id={`competition-tabpanel-${activeTab}`}
                    aria-labelledby={
                        visible.length > 1 ? `competition-tab-${activeTab}` : undefined
                    }
                    sx={{pt: visible.length > 1 ? 2 : 0}}>
                    <Suspense fallback={<LoadingState />}>{panel}</Suspense>
                </Box>
            </CompetitionNavigation>
            {mayEdit && (
                <CompetitionDialog
                    {...competitionAdministration.dialog}
                    isChallengeEvent={eventData.challengeEvent}
                    reloadData={() => {
                        reloadData()
                        reloadEvent()
                    }}
                />
            )}
        </Box>
    )
}

export default CompetitionPage
