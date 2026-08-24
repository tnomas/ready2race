package de.lambda9.ready2race.backend.app.eventInfo

import de.lambda9.ready2race.backend.app.eventInfo.boundary.BoardService
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardConfig
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardElement
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardElementType
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardRequest
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardTile
import de.lambda9.ready2race.backend.app.eventInfo.entity.EventInfoProblem
import de.lambda9.ready2race.backend.app.timing.addTestStation
import de.lambda9.ready2race.backend.app.timing.boundary.TimingDeviceTokenService
import de.lambda9.ready2race.backend.app.timing.createTestEventWithAdmin
import de.lambda9.ready2race.backend.app.timing.entity.TimingDeviceTokenRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingError
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationType
import de.lambda9.ready2race.testing.testComprehension
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

/**
 * Der Board-Share-Link und sein Zuschnitt.
 *
 * Board- und Posten-Tokens liegen seit Migration V202608250900 in derselben Tabelle - bewusst,
 * damit Ausstellen, Wiederverwendung und Widerruf nicht zweimal existieren. Der Preis dafür ist,
 * dass der Zuschnitt allein im Service gezogen wird, und genau der wird hier festgenagelt: ein
 * Board-Token öffnet sein Board und sonst nichts, ein Posten-Token öffnet kein Board, und keins
 * von beiden rutscht in den Weg des anderen.
 */
class BoardShareLinkTest {

    /** Ein Minimal-Board: die Uhr braucht keinen Lauf und keinen Zeitplan. */
    private fun boardRequest(name: String) = BoardRequest(
        name = name,
        config = BoardConfig(
            columns = 1,
            tiles = listOf(BoardTile(elements = listOf(BoardElement(type = BoardElementType.CLOCK)))),
        ),
    )

    @Test
    fun secondClickReturnsTheSameTokenAndLink() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val boardId = (!BoardService.createBoard(eventId, boardRequest("Anzeige Steg"))).dto.id

        val first = (!TimingDeviceTokenService.shareLinkForBoard(eventId, boardId, userId)).dto
        val second = (!TimingDeviceTokenService.shareLinkForBoard(eventId, boardId, userId)).dto

        assertEquals(first.token, second.token)
        assertEquals(first.deviceTokenId, second.deviceTokenId)
        assertEquals(first.path, second.path)
        assertTrue(first.path.startsWith("/board/$eventId/$boardId?token="))
    }

    @Test
    fun revokeForcesAFreshTokenOnTheNextClick() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val boardId = (!BoardService.createBoard(eventId, boardRequest("Anzeige Steg"))).dto.id

        val first = (!TimingDeviceTokenService.shareLinkForBoard(eventId, boardId, userId)).dto
        !TimingDeviceTokenService.revoke(eventId, first.deviceTokenId)

        // Das alte Token ist tot ...
        assertKIOFails(TimingError.DeviceTokenInvalid) {
            TimingDeviceTokenService.validateForBoard(first.token, eventId, boardId)
        }

        // ... und der nächste Klick stellt ein neues aus.
        val second = (!TimingDeviceTokenService.shareLinkForBoard(eventId, boardId, userId)).dto
        assertNotEquals(first.token, second.token)
        assertNotEquals(first.deviceTokenId, second.deviceTokenId)
    }

    @Test
    fun aBoardTokenOpensOnlyItsOwnBoard() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val boardId = (!BoardService.createBoard(eventId, boardRequest("Anzeige Steg"))).dto.id
        val otherBoardId = (!BoardService.createBoard(eventId, boardRequest("Anzeige Zelt"))).dto.id

        val link = (!TimingDeviceTokenService.shareLinkForBoard(eventId, boardId, userId)).dto

        assertKIOSucceeds {
            TimingDeviceTokenService.validateForBoard(link.token, eventId, boardId)
        }
        // Dieselbe Veranstaltung, dieselbe Sorte Token - und trotzdem zu. Ein geteilter Link
        // ist der Schlüssel für EINEN Bildschirm, nicht für alle Anzeigen des Vereins.
        assertKIOFails(TimingError.DeviceTokenInvalid) {
            TimingDeviceTokenService.validateForBoard(link.token, eventId, otherBoardId)
        }
    }

    @Test
    fun aBoardTokenOfAnotherEventStaysOut() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val (otherEventId, _) = !createTestEventWithAdmin()
        val boardId = (!BoardService.createBoard(eventId, boardRequest("Anzeige Steg"))).dto.id

        val link = (!TimingDeviceTokenService.shareLinkForBoard(eventId, boardId, userId)).dto

        assertKIOFails(TimingError.DeviceTokenInvalid) {
            TimingDeviceTokenService.validateForBoard(link.token, otherEventId, boardId)
        }
        assertKIOFails(TimingError.DeviceTokenInvalid) {
            TimingDeviceTokenService.validateBoardTokenForEvent(link.token, otherEventId)
        }
    }

    @Test
    fun aBoardTokenNeverOpensTheTimingSide() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val boardId = (!BoardService.createBoard(eventId, boardRequest("Anzeige Steg"))).dto.id

        val link = (!TimingDeviceTokenService.shareLinkForBoard(eventId, boardId, userId)).dto

        // Die beiden Wege, über die die Zeitnahme Geräte hereinlässt - beide zu. Ein Board-Token
        // liest Anzeigen, keine Zeitmarken.
        assertKIOFails(TimingError.DeviceTokenInvalid) {
            TimingDeviceTokenService.validateForEvent(link.token, eventId)
        }
        assertKIOFails(TimingError.DeviceTokenInvalid) {
            TimingDeviceTokenService.validate(link.token, eventId, stationId)
        }
    }

    @Test
    fun aStationTokenNeverOpensABoard() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val boardId = (!BoardService.createBoard(eventId, boardRequest("Anzeige Steg"))).dto.id

        val station = (!TimingDeviceTokenService.shareLink(eventId, stationId, userId)).dto
        val manual = (!TimingDeviceTokenService.issue(
            eventId,
            TimingDeviceTokenRequest("Lichtschranke Ziel", stationId),
            userId,
        )).dto

        for (token in listOf(station.token, manual.token)) {
            assertKIOFails(TimingError.DeviceTokenInvalid) {
                TimingDeviceTokenService.validateForBoard(token, eventId, boardId)
            }
            // Auch die weiche Variante für die Kurzliste lässt nur Board-Tokens durch.
            assertKIOFails(TimingError.DeviceTokenInvalid) {
                TimingDeviceTokenService.validateBoardTokenForEvent(token, eventId)
            }
        }
    }

    @Test
    fun theShortListAcceptsAnyBoardTokenOfTheEvent() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val boardId = (!BoardService.createBoard(eventId, boardRequest("Anzeige Steg"))).dto.id
        !BoardService.createBoard(eventId, boardRequest("Anzeige Zelt"))

        val link = (!TimingDeviceTokenService.shareLinkForBoard(eventId, boardId, userId)).dto

        // Absicht: ein geteiltes Gerät muss sein eigenes Board erst finden können - die
        // Kurzliste führt nur Kennung und Name.
        assertKIOSucceeds {
            TimingDeviceTokenService.validateBoardTokenForEvent(link.token, eventId)
        }
    }

    @Test
    fun theTimingDeviceTabKeepsShowingOnlyStationTokens() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val boardId = (!BoardService.createBoard(eventId, boardRequest("Anzeige Steg"))).dto.id

        val station = (!TimingDeviceTokenService.shareLink(eventId, stationId, userId)).dto
        !TimingDeviceTokenService.shareLinkForBoard(eventId, boardId, userId)

        // Beide Sorten liegen in derselben Tabelle; der Geräte-Reiter der Zeitnahme führt
        // trotzdem nur die mit Posten (sonst müsste seine Postenspalte leer bleiben).
        val listed = (!TimingDeviceTokenService.list(eventId)).data
        assertEquals(1, listed.size)
        assertEquals(station.deviceToken.id, listed.single().id)
        assertEquals(stationId, listed.single().station)
    }

    @Test
    fun anUnknownBoardIsNotShareable() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val (otherEventId, _) = !createTestEventWithAdmin()
        val foreignBoardId = (!BoardService.createBoard(otherEventId, boardRequest("Fremde Anzeige"))).dto.id
        val unknownBoardId = UUID.randomUUID()

        // Nicht vorhanden und "gehört einer anderen Veranstaltung" antworten gleich - sonst
        // verriete der Endpunkt, welche Board-Kennungen es gibt.
        assertKIOFails(EventInfoProblem.BoardNotFound(unknownBoardId)) {
            TimingDeviceTokenService.shareLinkForBoard(eventId, unknownBoardId, userId)
        }
        assertKIOFails(EventInfoProblem.BoardNotFound(foreignBoardId)) {
            TimingDeviceTokenService.shareLinkForBoard(eventId, foreignBoardId, userId)
        }
    }
}
