import {Box, Stack} from '@mui/material'
import BoardsPanel from '@components/event/board/BoardsPanel'
import StreamScenesPanel from '@components/event/stream/StreamScenesPanel'
import {eventInfoRoute} from '@routes'
import {useUser} from '@contexts/user/UserContext.ts'
import {readBoardGlobal, readEventGlobal, readStreamGlobal} from '@authorization/privileges.ts'

/**
 * Die Verwaltungsseite der Boards und der Livestream-Szenen. Bis zum Board-Umbau (10.08.2026)
 * rotierte hier die Info-Seite selbst durch ihre Views; die Anzeige läuft jetzt ausschließlich
 * über die öffentlichen Board-URLs (/board/{eventId}/{boardId}) bzw. die Szenen-URLs
 * (/event/{eventId}/stream/{sceneId}), diese Seite konfiguriert sie nur noch.
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
    const user = useUser()

    // Jedes Panel gilt für sein eigenes Recht (READ BOARD/READ STREAM), nicht nur für den
    // Seitenzugriff insgesamt: Eine reine Stream-Rolle ohne READ BOARD sieht diese Seite (die
    // Verlinkung in EventPage lässt sie über READ STREAM ebenfalls durch), aber ihr Aufruf von
    // getBoards liefe ungeprüft in den 403 des Servers.
    return (
        <Box sx={{p: 3}}>
            <Stack spacing={4}>
                {(user.checkPrivilege(readBoardGlobal) || user.checkPrivilege(readEventGlobal)) && (
                    <BoardsPanel eventId={eventId} />
                )}
                {(user.checkPrivilege(readStreamGlobal) || user.checkPrivilege(readEventGlobal)) && (
                    <StreamScenesPanel eventId={eventId} />
                )}
            </Stack>
        </Box>
    )
}

export default EventInfoPage
