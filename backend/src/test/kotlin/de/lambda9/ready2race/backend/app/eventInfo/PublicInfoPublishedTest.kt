package de.lambda9.ready2race.backend.app.eventInfo

import de.lambda9.ready2race.backend.app.eventInfo.boundary.BoardService
import de.lambda9.ready2race.backend.app.eventInfo.boundary.EventInfoService
import de.lambda9.ready2race.backend.app.eventInfo.boundary.MyEventService
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardConfig
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardElement
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardElementType
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardRequest
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardTile
import de.lambda9.ready2race.backend.app.eventInfo.entity.EventInfoProblem
import de.lambda9.ready2race.backend.app.timing.createTestEventWithAdmin
import de.lambda9.ready2race.testing.testComprehension
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Die öffentlichen Info-Endpunkte kennen nur veröffentlichte Veranstaltungen. Eine
 * Veranstaltung in Vorbereitung ist anonym unsichtbar - dieselbe Antwort wie für eine, die es
 * gar nicht gibt, damit niemand über die Anzeigen herausfindet, was noch nicht angekündigt ist.
 *
 * Die inneren Wege der angemeldeten Anzeigen (Board-Ansicht) bleiben davon unberührt: eine
 * Veranstalterin darf ihre Anzeige vor der Veröffentlichung einrichten und ansehen.
 */
class PublicInfoPublishedTest {

    @Test
    fun anUnpublishedEventIsUnknownToEveryPublicEndpointUntilItIsPublished() = testComprehension {
        val (eventId, _) = !createTestEventWithAdmin()
        val notFound = EventInfoProblem.EventNotFound(eventId)

        assertKIOFails(notFound) { EventInfoService.getUpcomingCompetitionMatches(eventId, 10) }
        assertKIOFails(notFound) { EventInfoService.getLatestMatchResults(eventId, 10, null) }
        assertKIOFails(notFound) { EventInfoService.getRunningMatches(eventId, 10) }
        assertKIOFails(notFound) { EventInfoService.getLiveMatches(eventId, 10) }
        assertKIOFails(notFound) { BoardService.getProgram(eventId) }
        assertKIOFails(notFound) { MyEventService.getMyEvent(eventId, "irgendein-code") }

        // Der angemeldete Weg der Anzeigen kennt die Veranstaltung schon vor der Veröffentlichung.
        val board = (!BoardService.createBoard(eventId, boardRequest())).dto
        !BoardService.getBoardView(eventId, board.id)

        !publishEvent(eventId)

        assertEquals(0, (!EventInfoService.getUpcomingCompetitionMatches(eventId, 10)).data.size)
        assertEquals(0, (!EventInfoService.getLatestMatchResults(eventId, 10, null)).data.size)
        assertEquals(0, (!EventInfoService.getRunningMatches(eventId, 10)).data.size)
        assertEquals(0, (!EventInfoService.getLiveMatches(eventId, 10)).dto.matches.size)
        assertEquals(0, (!BoardService.getProgram(eventId)).data.size)
        // Erst jetzt entscheidet der Code selbst - und der ist unbekannt.
        assertKIOFails(EventInfoProblem.QrCodeNotFound("irgendein-code")) {
            MyEventService.getMyEvent(eventId, "irgendein-code")
        }
    }

    private fun boardRequest() = BoardRequest(
        name = "Anzeige Steg",
        config = BoardConfig(
            columns = 1,
            tiles = listOf(BoardTile(elements = listOf(BoardElement(type = BoardElementType.CLOCK)))),
        ),
    )
}
