import {Box, Stack} from '@mui/material'
import BoardsPanel from '@components/event/board/BoardsPanel'
import {eventInfoRoute} from '@routes'

/**
 * Die Verwaltungsseite der Boards. Bis zum Board-Umbau (10.08.2026) rotierte hier die
 * Info-Seite selbst durch ihre Views; die Anzeige läuft jetzt ausschließlich über die
 * öffentlichen Board-URLs (/board/{eventId}/{boardId}), diese Seite konfiguriert sie
 * nur noch.
 *
 * Die Zeitnahme-Posten wohnten kurzzeitig ebenfalls hier (Entscheidung vom 21.08.2026,
 * Commit cdd5fbc7). Das ist am 22.08.2026 BEWUSST zurückgenommen: Thomas hat die
 * Postenverwaltung auf dieser Seite benutzt und nicht ans Ziel gefunden. Sie liegt jetzt in
 * der Zeitnahme-Kachel des Betrieb-Reiters der Veranstaltung (`BetriebTab`), zusammen mit
 * Leitstand-Einstieg und den direkten Posten-Links — bitte nicht als Versehen lesen und
 * zurückverschieben.
 */
const EventInfoPage = () => {
    const {eventId} = eventInfoRoute.useParams()

    return (
        <Box sx={{p: 3}}>
            <Stack spacing={4}>
                <BoardsPanel eventId={eventId} />
            </Stack>
        </Box>
    )
}

export default EventInfoPage
