import {Box} from '@mui/material'
import BoardsPanel from '@components/event/board/BoardsPanel'
import {eventInfoRoute} from '@routes'
import {useUser} from '@contexts/user/UserContext.ts'
import {readBoardGlobal, readEventGlobal} from '@authorization/privileges.ts'

/**
 * Die Verwaltungsseite der Boards (öffentliche Anzeigen). Bis zum Board-Umbau (10.08.2026)
 * rotierte hier die Info-Seite selbst durch ihre Views; die Anzeige läuft jetzt ausschließlich
 * über die öffentlichen Board-URLs (/board/{eventId}/{boardId}), diese Seite konfiguriert sie
 * nur noch.
 *
 * Die Livestream-Szenen wohnten bis zum 31.08.2026 ebenfalls hier — Entscheidung von Thomas:
 * öffentliche Anzeigen und Livestream sind zwei verschiedene Aufgaben und gehören getrennt
 * aufgeführt. Die Szenen-Verwaltung hat jetzt ihre eigene Seite (`EventStreamScenesPage`,
 * `/event/{eventId}/streamScenes`) samt eigener Kachel im Betrieb-Reiter.
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

    // Das Panel gilt für sein eigenes Recht (READ BOARD), nicht nur für den Seitenzugriff
    // insgesamt — ein ungeprüfter Aufruf von getBoards liefe sonst in den 403 des Servers.
    return (
        <Box sx={{p: 3}}>
            {(user.checkPrivilege(readBoardGlobal) || user.checkPrivilege(readEventGlobal)) && (
                <BoardsPanel eventId={eventId} />
            )}
        </Box>
    )
}

export default EventInfoPage
