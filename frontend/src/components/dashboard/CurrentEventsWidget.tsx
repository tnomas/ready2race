import {Fragment, useMemo} from 'react'
import {Box, Chip, ChipProps, Divider, List, ListItem, Stack, Typography} from '@mui/material'
import {EventAvailable, Forward} from '@mui/icons-material'
import {useTranslation} from 'react-i18next'
import {getEvents} from '@api/sdk.gen.ts'
import {EventDto} from '@api/types.gen.ts'
import {useUser} from '@contexts/user/UserContext.ts'
import {useFetch} from '@utils/hooks.ts'
import {ButtonLink, EmptyState, ErrorState, LoadingState, TextLink} from '@components/ui'
import {DashboardWidget} from '@components/dashboard/DashboardWidget.tsx'
import {
    CURRENT_EVENTS_FETCH_LIMIT,
    CURRENT_EVENTS_LIMIT,
    CurrentEventStatus,
    formatEventDateRange,
    sortCurrentEvents,
} from '@components/dashboard/currentEventsLogic.ts'
import {
    EVENT_SECTIONS,
    EventSectionKey,
    visibleEventSections,
} from '../../pages/event/eventSections.ts'

const STATUS_COLOR: Record<CurrentEventStatus, ChipProps['color']> = {
    running: 'success',
    upcoming: 'info',
    past: 'default',
    undated: 'default',
}

const STATUS_LABEL_KEYS = {
    running: 'dashboard.currentEvents.status.running',
    upcoming: 'dashboard.currentEvents.status.upcoming',
    past: 'dashboard.currentEvents.status.past',
    undated: 'dashboard.currentEvents.status.undated',
} as const satisfies Record<CurrentEventStatus, string>

/** Direktlinks je Veranstaltung, in dieser Reihenfolge; Zeitplan und Betrieb nur, wenn sichtbar. */
const LINK_SECTIONS: readonly EventSectionKey[] = ['general', 'schedule', 'betrieb']

/**
 * „Aktuelle Veranstaltungen" ganz oben auf der Übersicht: laufende zuerst, dann kommende, dann
 * vergangene – je mit Datum, Status und Direktlinks in die Bereiche, die die Person sieht.
 */
export function CurrentEventsWidget() {
    const {t, i18n} = useTranslation()
    const user = useUser()

    const {data, error, pending, reload} = useFetch(signal =>
        getEvents({
            signal,
            query: {
                limit: CURRENT_EVENTS_FETCH_LIMIT,
                sort: JSON.stringify([{field: 'NAME', direction: 'ASC'}]),
            },
        }),
    )

    // Die Uhr einmal je Datenstand: Die Liste soll nicht beim Neuzeichnen umspringen.
    const entries = useMemo(
        () => (data ? sortCurrentEvents(data.data, new Date()).slice(0, CURRENT_EVENTS_LIMIT) : []),
        [data],
    )

    const linkSections = useMemo(() => {
        const visible = new Set(visibleEventSections(user).map(s => s.key))
        return EVENT_SECTIONS.filter(s => LINK_SECTIONS.includes(s.key) && visible.has(s.key))
    }, [user])

    const content =
        data === null && pending ? (
            <LoadingState variant={'section'} />
        ) : error ? (
            <ErrorState dense onRetry={reload} />
        ) : entries.length === 0 ? (
            <EmptyState
                dense
                icon={<EventAvailable />}
                title={t('dashboard.currentEvents.empty')}
            />
        ) : (
            <List disablePadding>
                {entries.map(({event, status}, index) => (
                    <Fragment key={event.id}>
                        {index !== 0 && <Divider component={'li'} />}
                        <CurrentEventEntry
                            event={event}
                            status={status}
                            dateRange={formatEventDateRange(
                                event.firstEventDay,
                                event.lastEventDay,
                                i18n.language,
                            )}
                            linkSections={linkSections}
                        />
                    </Fragment>
                ))}
            </List>
        )

    return (
        <DashboardWidget
            size={12}
            header={t('dashboard.currentEvents.title')}
            maxHeight={'none'}
            content={content}
            footerAction={
                <ButtonLink to={'/event'} endIcon={<Forward />} size={'small'}>
                    {t('dashboard.currentEvents.all')}
                </ButtonLink>
            }
        />
    )
}

type EntryProps = {
    event: EventDto
    status: CurrentEventStatus
    dateRange: string | null
    linkSections: typeof EVENT_SECTIONS
}

const CurrentEventEntry = ({event, status, dateRange, linkSections}: EntryProps) => {
    const {t} = useTranslation()
    return (
        <ListItem
            disableGutters
            sx={{
                py: 1.25,
                px: {xs: 0.5, md: 1},
                display: 'flex',
                flexDirection: {xs: 'column', md: 'row'},
                alignItems: {xs: 'stretch', md: 'center'},
                gap: {xs: 1, md: 2},
            }}>
            <Box sx={{flex: 1, minWidth: 0}}>
                <Stack direction={'row'} spacing={1} alignItems={'center'} sx={{minWidth: 0}}>
                    <TextLink
                        to={'/event/$eventId'}
                        params={{eventId: event.id}}
                        variant={'subtitle1'}
                        sx={{fontWeight: 600, overflowWrap: 'anywhere'}}>
                        {event.name}
                    </TextLink>
                    <Chip
                        size={'small'}
                        color={STATUS_COLOR[status]}
                        variant={status === 'undated' ? 'outlined' : 'filled'}
                        label={t(STATUS_LABEL_KEYS[status])}
                        sx={{flexShrink: 0}}
                    />
                </Stack>
                {dateRange && (
                    <Typography variant={'body2'} color={'text.secondary'}>
                        {dateRange}
                    </Typography>
                )}
            </Box>
            <Stack
                direction={'row'}
                spacing={1}
                useFlexGap
                flexWrap={'wrap'}
                aria-label={t('dashboard.currentEvents.linksLabel', {name: event.name})}
                role={'group'}
                sx={{flexShrink: 0}}>
                {linkSections.map(s => {
                    const Icon = s.icon
                    return (
                        <ButtonLink
                            key={s.key}
                            to={'/event/$eventId'}
                            params={{eventId: event.id}}
                            search={{tab: s.key === 'general' ? undefined : s.key}}
                            size={'small'}
                            variant={'outlined'}
                            startIcon={<Icon />}>
                            {t(s.labelKey)}
                        </ButtonLink>
                    )
                })}
            </Stack>
        </ListItem>
    )
}
