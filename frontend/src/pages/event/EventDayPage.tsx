import {Box, Button, Card} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {format, parseISO} from 'date-fns'
import {useEntityAdministration, useFeedback, useFetch} from '@utils/hooks.ts'
import {eventDayRoute, eventRoute} from '@routes'
import {ErrorState, LoadingState, PageHeader} from '@components/ui'
import {buildEventTrail} from '@utils/navigation/breadcrumbs.ts'
import {useUser} from '@contexts/user/UserContext.ts'
import {updateEventGlobal} from '@authorization/privileges.ts'
import EventDayDialog from '@components/event/eventDay/EventDayDialog.tsx'
import {EventDayDto} from '@api/types.gen.ts'
import {useEventName} from './useEventName.ts'
import CompetitionAndDayAssignment from '@components/event/CompetitionAndDayAssignment.tsx'
import {AutocompleteOption} from '@utils/types.ts'
import {competitionLabelName} from '@components/event/competition/common.ts'
import {useState} from 'react'
import {getEventDay, getCompetitions} from '@api/sdk.gen.ts'

const EventDayPage = () => {
    const {t} = useTranslation()
    const feedback = useFeedback()
    const user = useUser()

    const {eventId} = eventRoute.useParams()
    const {eventDayId} = eventDayRoute.useParams()

    const [reloadData, setReloadData] = useState(false)

    const eventName = useEventName(eventId)
    const eventDayAdministration = useEntityAdministration<EventDayDto>(
        t('event.eventDay.eventDay'),
        {entityCreate: false, entityDelete: false},
    )

    const {
        data: eventDayData,
        error: eventDayError,
        reload: reloadEventDay,
    } = useFetch(
        signal => getEventDay({signal, path: {eventId: eventId, eventDayId: eventDayId}}),
        {
            onResponse: ({error}) => {
                if (error) {
                    feedback.error(
                        t('common.load.error.single', {entity: t('event.eventDay.eventDay')}),
                    )
                }
            },
            deps: [eventId, eventDayId, eventDayAdministration.table.lastRequested],
        },
    )

    const {
        data: assignedCompetitionsData,
        error: assignedCompetitionsError,
        reload: reloadAssignedCompetitions,
    } = useFetch(
        signal =>
            getCompetitions({signal, path: {eventId: eventId}, query: {eventDayId: eventDayId}}),
        {
            onResponse: ({error}) => {
                if (error) {
                    feedback.error(
                        t('common.load.error.multiple.short', {
                            entity: t('event.competition.competitions'),
                        }),
                    )
                }
            },
            deps: [eventId, eventDayId, reloadData],
        },
    )
    const assignedCompetitions = assignedCompetitionsData?.data.map(value => value.id) ?? []

    const {
        data: competitionsData,
        error: competitionsError,
        reload: reloadCompetitions,
    } = useFetch(signal => getCompetitions({signal, path: {eventId: eventId}}), {
        onResponse: ({error}) => {
            if (error) {
                feedback.error(
                    t('common.load.error.multiple.short', {
                        entity: t('event.competition.competitions'),
                    }),
                )
            }
        },
        deps: [eventId, reloadData],
    })

    const selection: AutocompleteOption[] =
        competitionsData?.data.map(value => ({
            id: value.id,
            label: competitionLabelName(value.properties.identifier, value.properties.name),
        })) ?? []

    const dayTitle = eventDayData
        ? format(parseISO(eventDayData.date), t('format.date')) +
          (eventDayData.name ? ' | ' + eventDayData.name : '')
        : ''

    const header = (
        <PageHeader
            title={eventDayData ? dayTitle : t('event.eventDay.eventDay')}
            subtitle={eventDayData?.description}
            breadcrumbs={buildEventTrail({
                eventsLabel: t('navigation.titles.events'),
                eventId,
                eventName,
                section: {tab: 'competitions', label: t('nav.event.sections.competitions')},
                trail: [{label: eventDayData ? dayTitle : t('event.eventDay.eventDay')}],
            })}
            actions={
                eventDayData &&
                user.checkPrivilege(updateEventGlobal) && (
                    <Button
                        variant={'outlined'}
                        onClick={() => eventDayAdministration.table.openDialog(eventDayData)}
                        className="cursor-pointer">
                        {t('common.edit')}
                    </Button>
                )
            }
        />
    )

    if (!eventDayData) {
        return (
            <Box>
                {header}
                {eventDayError ? (
                    <ErrorState
                        message={t('common.load.error.single', {
                            entity: t('event.eventDay.eventDay'),
                        })}
                        onRetry={reloadEventDay}
                    />
                ) : (
                    <LoadingState />
                )}
            </Box>
        )
    }

    const assignmentError = assignedCompetitionsError || competitionsError

    return (
        <Box>
            {header}
            <Card sx={{p: 2}}>
                {competitionsData && assignedCompetitionsData ? (
                    <CompetitionAndDayAssignment
                        entityPathId={eventDayId}
                        options={selection}
                        assignedEntities={assignedCompetitions}
                        assignEntityLabel={t('event.competition.competition')}
                        competitionsToDay={true}
                        reloadData={() => setReloadData(!reloadData)}
                    />
                ) : assignmentError ? (
                    <ErrorState
                        dense
                        message={t('common.load.error.multiple.short', {
                            entity: t('event.competition.competitions'),
                        })}
                        onRetry={() => {
                            reloadAssignedCompetitions()
                            reloadCompetitions()
                        }}
                    />
                ) : (
                    <LoadingState />
                )}
            </Card>
            <EventDayDialog {...eventDayAdministration.dialog} />
        </Box>
    )
}

export default EventDayPage
