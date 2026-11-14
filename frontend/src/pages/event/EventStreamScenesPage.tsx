import {Box} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {PageHeader} from '@components/ui'
import {buildEventTrail} from '@utils/navigation/breadcrumbs.ts'
import {useEventName} from './useEventName.ts'
import StreamScenesPanel from '@components/event/stream/StreamScenesPanel'
import {eventStreamScenesRoute} from '@routes'

/**
 * Die Verwaltungsseite der Livestream-Szenen. Bis zum 31.08.2026 wohnte sie mit der
 * Board-Verwaltung zusammen auf der Info-Seite (`EventInfoPage`) — Entscheidung von Thomas:
 * öffentliche Anzeigen und Livestream sind zwei verschiedene Aufgaben mit zwei verschiedenen
 * Rollen und gehören getrennt aufgeführt (eigene Kachel im Betrieb-Reiter, eigene Adresse).
 *
 * Kein eigener Privilegien-Check im Rumpf: die Route (`eventStreamScenesRoute`) lässt nur
 * READ STREAM oder READ EVENT durch — dieselbe Tür wie das Kontroll-Panel.
 */
const EventStreamScenesPage = () => {
    const {t} = useTranslation()
    const {eventId} = eventStreamScenesRoute.useParams()
    const eventName = useEventName(eventId)

    return (
        <Box>
            <PageHeader
                title={t('event.betrieb.livestream.title')}
                breadcrumbs={buildEventTrail({
                    eventsLabel: t('navigation.titles.events'),
                    eventId,
                    eventName,
                    section: {tab: 'betrieb', label: t('nav.event.sections.betrieb')},
                    trail: [{label: t('event.betrieb.livestream.title')}],
                })}
            />
            <StreamScenesPanel eventId={eventId} />
        </Box>
    )
}

export default EventStreamScenesPage
