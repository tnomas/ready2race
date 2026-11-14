import {lazy, ReactNode, Suspense, useMemo} from 'react'
import {Box, Button, Chip, ListItemIcon, ListSubheader, MenuItem, TextField} from '@mui/material'
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline'
import EditOutlined from '@mui/icons-material/EditOutlined'
import Forward from '@mui/icons-material/Forward'
import {format, parseISO} from 'date-fns'
import {useTranslation} from 'react-i18next'
import {useNavigate} from '@tanstack/react-router'
import {eventIndexRoute, eventRoute} from '@routes'
import {getEvent, getEventDays, getRegistrationsForEvent} from '@api/sdk.gen.ts'
import {EventDto} from '@api/types.gen.ts'
import {readEventGlobal} from '@authorization/privileges.ts'
import {useUser} from '@contexts/user/UserContext.ts'
import {useEntityAdministration, useFetch} from '@utils/hooks.ts'
import {getRegistrationState} from '@utils/helpers.ts'
import {useDocumentTitle} from '@utils/useDocumentTitle.ts'
import {loadChunk} from '@utils/chunkReload.ts'
import {primaryTextColor, statusTextColor} from '../../theme/themeColors.ts'
import {buildEventTrail} from '@utils/navigation/breadcrumbs.ts'
import {ButtonLink, ErrorState, LoadingState, PageHeader} from '@components/ui'
import EventDialog from '@components/event/EventDialog.tsx'
import CompetitionsAndEventDays from '@components/event/CompetitionsAndEventDays.tsx'
import {
    EventSection,
    EventSectionKey,
    groupEventSections,
    isEventSectionKey,
    resolveEventTab,
    showEventSectionGroupHeadings,
    visibleEventSections,
} from './eventSections.ts'
import {canEditEvent, eventDateRange} from './eventPageLogic.ts'
import OverviewTab from './tabs/OverviewTab.tsx'

// Bereiche mit schweren Abhängigkeiten (Zeitplan mit Drag-and-drop, Schichtplan-Kalender,
// Betrieb mit „Laufende Läufe verwalten", PDF-Dialoge, Rechnungen) laden erst, wenn sie gezeigt
// werden. `loadChunk` lädt nach einem Deployment einmal neu, statt an einem alten Stück zu hängen.
const EventSchedule = lazy(() =>
    loadChunk(() => import('@components/event/schedule/EventSchedule.tsx')),
)
const EventRegistrations = lazy(() =>
    loadChunk(() => import('@components/event/competition/registration/EventRegistrations.tsx')),
)
const ParticipantsTab = lazy(() => loadChunk(() => import('./tabs/ParticipantsTab.tsx')))
const OrganizationTab = lazy(() => loadChunk(() => import('./tabs/OrganizationTab.tsx')))
const BetriebTab = lazy(() => loadChunk(() => import('./tabs/BetriebTab.tsx')))
const SettingsTab = lazy(() => loadChunk(() => import('./tabs/SettingsTab.tsx')))
const InvoicesTab = lazy(() => loadChunk(() => import('./tabs/InvoicesTab.tsx')))
const ResultsTab = lazy(() => loadChunk(() => import('./tabs/ResultsTab.tsx')))

/**
 * Kompakte Bereichsauswahl unter `md`. Ab `md` navigiert die Seitenleiste (Bereichsmodell aus
 * `eventSections.ts`); darunter ist die Seitenleiste ein eingeklappter Drawer, deshalb steht hier
 * eine Auswahl mit denselben Bereichen und Gruppen.
 */
const EventSectionSelect = ({
    visible,
    active,
    onChange,
}: {
    visible: EventSection[]
    active: EventSectionKey
    onChange: (key: EventSectionKey) => void
}) => {
    const {t} = useTranslation()
    const headings = showEventSectionGroupHeadings(visible)
    const items: ReactNode[] = []
    for (const block of groupEventSections(visible)) {
        if (headings && block.labelKey) {
            items.push(
                <ListSubheader key={`group-${block.group}`}>{t(block.labelKey)}</ListSubheader>,
            )
        }
        for (const s of block.sections) {
            const Icon = s.icon
            items.push(
                <MenuItem key={s.key} value={s.key} sx={{cursor: 'pointer'}}>
                    <ListItemIcon>
                        <Icon fontSize={'small'} />
                    </ListItemIcon>
                    {t(s.labelKey)}
                </MenuItem>,
            )
        }
    }
    const labelOf = (key: unknown) => {
        const s = visible.find(v => v.key === key)
        return s ? t(s.labelKey) : ''
    }

    return (
        <TextField
            select
            fullWidth
            size={'small'}
            label={t('nav.event.sectionSelect')}
            value={active}
            onChange={e => {
                if (isEventSectionKey(e.target.value)) onChange(e.target.value)
            }}
            slotProps={{select: {renderValue: labelOf}}}
            sx={{display: {xs: 'flex', md: 'none'}, mb: 3}}>
            {items}
        </TextField>
    )
}

const EventPage = () => {
    const {t} = useTranslation()
    const user = useUser()
    const navigate = useNavigate()

    const {eventId} = eventRoute.useParams()
    const {tab} = eventIndexRoute.useSearch()

    // Sichtbarkeit und Rückfall kommen aus dem Bereichsmodell: ein unbekannter oder nicht
    // erlaubter `?tab=` landet auf der Übersicht statt auf einem leeren Panel.
    const visible = useMemo(() => visibleEventSections(user), [user])
    const activeTab = resolveEventTab(tab, visible)
    const activeSection = visible.find(s => s.key === activeTab)

    const switchTab = (next: EventSectionKey) => {
        navigate({to: '/event/$eventId', params: {eventId}, search: {tab: next}}).then()
    }

    const {data, error, reload} = useFetch(signal => getEvent({signal, path: {eventId}}), {
        deps: [eventId],
    })

    // Zeitraum für den Kopf aus den Tagen; ohne Tage oder bei Fehler bleibt er einfach weg.
    const {data: eventDays} = useFetch(
        signal => getEventDays({signal, path: {eventId}, query: {limit: 100}}),
        {deps: [eventId]},
    )

    // Hat der eigene Verein schon gemeldet? Verlässlich nur mit Leserecht im Umfang OWN: dann
    // liefert die Meldungsliste genau die Meldung(en) des eigenen Vereins. Mit GLOBAL (etwa
    // Administration mit Verein) wäre es eine Seite fremder Meldungen - dort bleibt der Knopf
    // beim neutralen „Zur Meldung".
    const ownRegistrationScope =
        user.loggedIn &&
        Boolean(user.clubId) &&
        user.getPrivilegeScope('READ', 'REGISTRATION') === 'OWN'
    const {data: ownRegistrations} = useFetch(
        signal => getRegistrationsForEvent({signal, path: {eventId}, query: {limit: 1}}),
        {preCondition: () => ownRegistrationScope, deps: [eventId, ownRegistrationScope]},
    )
    const hasOwnRegistration = ownRegistrationScope && (ownRegistrations?.pagination.total ?? 0) > 0

    useDocumentTitle(data?.name)

    const eventAdministration = useEntityAdministration<EventDto>(t('event.event'))

    const breadcrumbs = buildEventTrail({
        eventsLabel: t('navigation.titles.events'),
        eventId,
        eventName: data?.name,
        section:
            activeSection && activeSection.group !== null
                ? {tab: activeSection.key, label: t(activeSection.labelKey)}
                : undefined,
    })

    if (!data) {
        if (error) {
            return (
                <Box>
                    <PageHeader title={t('event.event')} breadcrumbs={breadcrumbs} />
                    <ErrorState
                        message={
                            error.status === 404 || error.status === 403
                                ? t('event.overview.notFound')
                                : t('event.overview.loadError')
                        }
                        onRetry={reload}
                    />
                </Box>
            )
        }
        return <LoadingState variant={'page'} />
    }

    const registrationState = getRegistrationState(data)
    const hasRegistrationPeriod = Boolean(
        data.registrationAvailableFrom || data.registrationAvailableTo,
    )
    const canRegister = user.loggedIn && Boolean(user.clubId) && registrationState !== 'CLOSED'

    const range = eventDateRange(eventDays?.data.map(d => d.date) ?? [])
    const formatDay = (date: string) => format(parseISO(date), t('format.date'))
    const subtitleParts = [
        range &&
            (range.from === range.to
                ? formatDay(range.from)
                : `${formatDay(range.from)} – ${formatDay(range.to)}`),
        data.location,
    ].filter((part): part is string => Boolean(part))

    const meta = (
        <>
            {user.checkPrivilege(readEventGlobal) && (
                <Chip
                    size={'small'}
                    variant={'outlined'}
                    icon={data.published ? <CheckCircleOutline /> : undefined}
                    sx={
                        data.published
                            ? {
                                  color: theme => statusTextColor(theme, 'success'),
                                  borderColor: 'currentColor',
                                  '& .MuiChip-icon': {color: 'inherit'},
                              }
                            : undefined
                    }
                    label={
                        data.published ? t('event.published.published') : t('event.published.not')
                    }
                />
            )}
            {hasRegistrationPeriod && (
                <Chip
                    size={'small'}
                    variant={'outlined'}
                    sx={
                        registrationState === 'CLOSED'
                            ? undefined
                            : {color: theme => primaryTextColor(theme), borderColor: 'currentColor'}
                    }
                    label={
                        registrationState === 'REGULAR'
                            ? t('event.overview.registration.open')
                            : registrationState === 'LATE'
                              ? t('event.overview.registration.late')
                              : t('event.overview.registration.closed')
                    }
                />
            )}
        </>
    )

    const actions =
        canRegister || canEditEvent(user.checkPrivilege) ? (
            <>
                {canEditEvent(user.checkPrivilege) && (
                    <Button
                        variant={'outlined'}
                        startIcon={<EditOutlined />}
                        onClick={() => eventAdministration.table.openDialog(data)}>
                        {t('common.edit')}
                    </Button>
                )}
                {canRegister && (
                    <ButtonLink
                        to={'/event/$eventId/register'}
                        params={{eventId}}
                        variant={'contained'}
                        endIcon={<Forward />}>
                        {hasOwnRegistration ? t('event.registerEdit') : t('event.registerNow')}
                    </ButtonLink>
                )}
            </>
        ) : undefined

    const panel = (() => {
        switch (activeTab) {
            case 'general':
                return (
                    <OverviewTab
                        event={data}
                        reloadEvent={reload}
                        showRaceDay={visible.some(s => s.key === 'betrieb')}
                        showResults={visible.some(s => s.key === 'results')}
                    />
                )
            case 'competitions':
                return <CompetitionsAndEventDays isChallengeEvent={data.challengeEvent} />
            case 'settings':
                return <SettingsTab event={data} reloadEvent={reload} />
            case 'registrations':
                return (
                    <EventRegistrations
                        registrationsFinalized={data.registrationsFinalized}
                        eventDto={data}
                    />
                )
            case 'participants':
                return <ParticipantsTab event={data} />
            case 'invoices':
                return <InvoicesTab event={data} reloadEvent={reload} />
            case 'schedule':
                return <EventSchedule event={data} />
            case 'betrieb':
                return (
                    <BetriebTab
                        eventId={eventId}
                        switchTab={switchTab}
                        challengeEvent={data.challengeEvent}
                    />
                )
            case 'organization':
                return <OrganizationTab eventId={eventId} />
            case 'results':
                return <ResultsTab event={data} />
        }
    })()

    return (
        <Box>
            <PageHeader
                title={data.name}
                subtitle={subtitleParts.length > 0 ? subtitleParts.join(' · ') : undefined}
                meta={meta}
                actions={actions}
                breadcrumbs={breadcrumbs}
            />
            <EventSectionSelect visible={visible} active={activeTab} onChange={switchTab} />
            <Box
                component={'section'}
                aria-label={activeSection ? t(activeSection.labelKey) : undefined}>
                <Suspense fallback={<LoadingState />}>{panel}</Suspense>
            </Box>
            <EventDialog {...eventAdministration.dialog} reloadData={reload} />
        </Box>
    )
}

export default EventPage
