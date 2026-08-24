package de.lambda9.ready2race.backend.app.eventInfo

import de.lambda9.ready2race.backend.app.eventInfo.boundary.BoardService
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardConfig
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardElement
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardElementType
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardRequest
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardTile
import de.lambda9.ready2race.backend.app.timing.addTestStation
import de.lambda9.ready2race.backend.app.timing.boundary.TIMING_DEVICE_TOKEN_HEADER
import de.lambda9.ready2race.backend.app.timing.boundary.TimingDeviceTokenService
import de.lambda9.ready2race.backend.app.timing.createTestEventWithAdmin
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationType
import de.lambda9.ready2race.testing.testApplicationComprehension
import io.ktor.client.request.*
import io.ktor.http.*
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Routen-Abdeckung der Board-Authentifizierung. Bis zum 25.08.2026 waren beide Endpunkte
 * öffentlich; jetzt kommt hinein, wer eine Sitzung mit Board-Leserecht ODER ein Board-Geräte-Token
 * im Header vorzeigt - und sonst niemand.
 *
 * Über die Route geprüft, nicht nur im Service: die Entscheidung fällt im Auth-Zweig der
 * Routendatei (Token nur ohne Sitzung), und der ist nur von außen sichtbar. Der Header heißt
 * weiterhin X-Timing-Device-Token, weil Geräte im Feld genau den senden.
 */
class BoardDeviceTokenAuthTest {

    private fun boardRequest(name: String) = BoardRequest(
        name = name,
        config = BoardConfig(
            columns = 1,
            tiles = listOf(BoardTile(elements = listOf(BoardElement(type = BoardElementType.CLOCK)))),
        ),
    )

    @Test
    fun aBoardTokenReadsItsBoardAndTheShortList() = testApplicationComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val boardId = (!BoardService.createBoard(eventId, boardRequest("Anzeige Steg"))).dto.id
        val link = (!TimingDeviceTokenService.shareLinkForBoard(eventId, boardId, userId)).dto

        for (path in listOf(
            "/api/event/$eventId/info/boards",
            "/api/event/$eventId/info/board/$boardId",
        )) {
            val response = client.get(path) {
                header(TIMING_DEVICE_TOKEN_HEADER, link.token)
            }
            assertEquals(HttpStatusCode.OK, response.status, "expected 200 for $path")
        }
    }

    @Test
    fun aBoardTokenDoesNotOpenAnotherBoard() = testApplicationComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val boardId = (!BoardService.createBoard(eventId, boardRequest("Anzeige Steg"))).dto.id
        val otherBoardId = (!BoardService.createBoard(eventId, boardRequest("Anzeige Zelt"))).dto.id
        val link = (!TimingDeviceTokenService.shareLinkForBoard(eventId, boardId, userId)).dto

        val response = client.get("/api/event/$eventId/info/board/$otherBoardId") {
            header(TIMING_DEVICE_TOKEN_HEADER, link.token)
        }

        assertEquals(HttpStatusCode.Unauthorized, response.status)
    }

    @Test
    fun aStationTokenDoesNotOpenABoard() = testApplicationComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val boardId = (!BoardService.createBoard(eventId, boardRequest("Anzeige Steg"))).dto.id
        val station = (!TimingDeviceTokenService.shareLink(eventId, stationId, userId)).dto

        for (path in listOf(
            "/api/event/$eventId/info/boards",
            "/api/event/$eventId/info/board/$boardId",
        )) {
            val response = client.get(path) {
                header(TIMING_DEVICE_TOKEN_HEADER, station.token)
            }
            assertEquals(HttpStatusCode.Unauthorized, response.status, "expected 401 for $path")
        }
    }

    @Test
    fun aBoardTokenDoesNotOpenTimingEndpoints() = testApplicationComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val boardId = (!BoardService.createBoard(eventId, boardRequest("Anzeige Steg"))).dto.id
        val link = (!TimingDeviceTokenService.shareLinkForBoard(eventId, boardId, userId)).dto

        // Dieselben Lesewege, die ein Posten-Token öffnet - für ein Board-Token alle zu.
        for (path in listOf(
            "/api/event/$eventId/timing/state",
            "/api/event/$eventId/timing/stations",
            "/api/event/$eventId/timing/teams",
            "/api/event/$eventId/timing/matches",
            "/api/event/$eventId/timing/sequences/active?stationId=$stationId",
        )) {
            val response = client.get(path) {
                header(TIMING_DEVICE_TOKEN_HEADER, link.token)
            }
            assertEquals(HttpStatusCode.Unauthorized, response.status, "expected 401 for $path")
        }
    }

    @Test
    fun aRevokedBoardTokenIsRejected() = testApplicationComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val boardId = (!BoardService.createBoard(eventId, boardRequest("Anzeige Steg"))).dto.id
        val link = (!TimingDeviceTokenService.shareLinkForBoard(eventId, boardId, userId)).dto
        !TimingDeviceTokenService.revoke(eventId, link.deviceTokenId)

        val response = client.get("/api/event/$eventId/info/board/$boardId") {
            header(TIMING_DEVICE_TOKEN_HEADER, link.token)
        }

        assertEquals(HttpStatusCode.Unauthorized, response.status)
    }

    @Test
    fun withoutTokenAndWithoutSessionTheBoardsAreClosed() = testApplicationComprehension {
        val (eventId, _) = !createTestEventWithAdmin()
        val boardId = (!BoardService.createBoard(eventId, boardRequest("Anzeige Steg"))).dto.id

        // Der eigentliche Punkt dieses Pakets: genau das ging bis zum 25.08.2026 ohne alles.
        for (path in listOf(
            "/api/event/$eventId/info/boards",
            "/api/event/$eventId/info/board/$boardId",
        )) {
            assertEquals(
                HttpStatusCode.Unauthorized,
                client.get(path).status,
                "expected 401 for $path",
            )
        }

        // Die übrigen öffentlichen Info-Endpunkte bleiben, was sie waren - die Umstellung
        // betrifft nur die Boards.
        assertEquals(
            HttpStatusCode.OK,
            client.get("/api/event/$eventId/info/upcoming-matches?limit=5").status,
        )
    }

    @Test
    fun anInvalidTokenIsRejected() = testApplicationComprehension {
        val (eventId, _) = !createTestEventWithAdmin()
        val boardId = (!BoardService.createBoard(eventId, boardRequest("Anzeige Steg"))).dto.id

        val response = client.get("/api/event/$eventId/info/board/$boardId") {
            header(TIMING_DEVICE_TOKEN_HEADER, "nope")
        }

        assertEquals(HttpStatusCode.Unauthorized, response.status)
    }
}
