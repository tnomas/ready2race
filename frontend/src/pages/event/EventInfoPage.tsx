import {Box, Stack} from '@mui/material'
import BoardsPanel from '@components/event/board/BoardsPanel'
import TimingStationPanel from '@components/event/timing/TimingStationPanel.tsx'
import {eventInfoRoute} from '@routes'
import {useUser} from '@contexts/user/UserContext.ts'
import {updateEventGlobal} from '@authorization/privileges.ts'

/**
 * Die Verwaltungsseite der Boards. Bis zum Board-Umbau (10.08.2026) rotierte hier die
 * Info-Seite selbst durch ihre Views; die Anzeige läuft jetzt ausschließlich über die
 * öffentlichen Board-URLs (/board/{eventId}/{boardId}), diese Seite konfiguriert sie
 * nur noch.
 *
 * Die Zeitnahme-Posten wohnen mit hier: eine Fläche für alles, was am Regattatag an
 * Bildschirmen und Arbeitsplätzen konfiguriert wird (Entscheidung vom 21.08.2026, statt
 * eines eigenen Posten-Tabs auf der Event-Seite). Nur für die Veranstaltungsverwaltung —
 * das Anlegen und Ändern von Posten verlangt serverseitig `UPDATE EVENT`, eine Leserolle
 * liefe hier in 403er.
 */
const EventInfoPage = () => {
    const {eventId} = eventInfoRoute.useParams()
    const user = useUser()

    return (
        <Box sx={{p: 3}}>
            <Stack spacing={4}>
                <BoardsPanel eventId={eventId} />
                {user.checkPrivilege(updateEventGlobal) && <TimingStationPanel />}
            </Stack>
        </Box>
    )
}

export default EventInfoPage
