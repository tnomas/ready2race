import {Box} from '@mui/material'
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
    const {eventId} = eventStreamScenesRoute.useParams()

    return (
        <Box sx={{p: 3}}>
            <StreamScenesPanel eventId={eventId} />
        </Box>
    )
}

export default EventStreamScenesPage
