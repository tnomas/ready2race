package de.lambda9.ready2race.backend.app.stream

import de.lambda9.ready2race.backend.app.auth.entity.AuthError
import de.lambda9.ready2race.backend.app.eventInfo.boundary.BoardService
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardConfig
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardElement
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardElementType
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardRequest
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardTile
import de.lambda9.ready2race.backend.app.stream.boundary.StreamSceneService
import de.lambda9.ready2race.backend.app.stream.entity.StreamBackground
import de.lambda9.ready2race.backend.app.stream.entity.StreamError
import de.lambda9.ready2race.backend.app.stream.entity.StreamSceneRequest
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
 * Der Szenen-Share-Link und sein Zuschnitt - Wort für Wort
 * [BoardShareLinkTest][de.lambda9.ready2race.backend.app.eventInfo.BoardShareLinkTest], nur für
 * das dritte Ziel derselben Token-Infrastruktur (Migration V202608271000). Der Zuschnitt wird
 * wieder allein im Service gezogen, und genau der wird hier festgenagelt: ein Szenen-Token
 * öffnet seine eigene Szene und sonst nichts - kein anderes Szenen-Token-Ziel, kein Board, kein
 * Zeitnahme-Posten.
 */
class StreamSceneShareLinkTest {

    private fun sceneRequest(name: String) = StreamSceneRequest(name = name, background = StreamBackground.TRANSPARENT)

    @Test
    fun secondClickReturnsTheSameTokenAndLink() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val sceneId = (!StreamSceneService.createScene(eventId, sceneRequest("Rennen"))).dto.id

        val first = (!StreamSceneService.createShareLink(eventId, sceneId, userId)).dto
        val second = (!StreamSceneService.createShareLink(eventId, sceneId, userId)).dto

        assertEquals(first.token, second.token)
        assertEquals(first.deviceTokenId, second.deviceTokenId)
        assertEquals(first.path, second.path)
        assertTrue(first.path.startsWith("/event/$eventId/stream/$sceneId?token="))
    }

    @Test
    fun revokeForcesAFreshTokenOnTheNextClick() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val sceneId = (!StreamSceneService.createScene(eventId, sceneRequest("Rennen"))).dto.id

        val first = (!StreamSceneService.createShareLink(eventId, sceneId, userId)).dto
        !TimingDeviceTokenService.revoke(eventId, first.deviceTokenId)

        assertKIOFails(TimingError.DeviceTokenInvalid) {
            TimingDeviceTokenService.validateForStreamScene(first.token, eventId, sceneId)
        }

        val second = (!StreamSceneService.createShareLink(eventId, sceneId, userId)).dto
        assertNotEquals(first.token, second.token)
        assertNotEquals(first.deviceTokenId, second.deviceTokenId)
    }

    @Test
    fun aSceneTokenOpensOnlyItsOwnScene() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val sceneId = (!StreamSceneService.createScene(eventId, sceneRequest("Rennen"))).dto.id
        val otherSceneId = (!StreamSceneService.createScene(eventId, sceneRequest("Tagesprogramm"))).dto.id

        val link = (!StreamSceneService.createShareLink(eventId, sceneId, userId)).dto

        assertKIOSucceeds {
            TimingDeviceTokenService.validateForStreamScene(link.token, eventId, sceneId)
        }
        // Dieselbe Veranstaltung, dieselbe Sorte Token - trotzdem zu. Ein geteilter Link ist der
        // Schlüssel für EINE Bühne, nicht für jede Szene der Veranstaltung.
        assertKIOFails(TimingError.DeviceTokenInvalid) {
            TimingDeviceTokenService.validateForStreamScene(link.token, eventId, otherSceneId)
        }
    }

    @Test
    fun aSceneTokenOfAnotherEventStaysOut() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val (otherEventId, _) = !createTestEventWithAdmin()
        val sceneId = (!StreamSceneService.createScene(eventId, sceneRequest("Rennen"))).dto.id

        val link = (!StreamSceneService.createShareLink(eventId, sceneId, userId)).dto

        assertKIOFails(TimingError.DeviceTokenInvalid) {
            TimingDeviceTokenService.validateForStreamScene(link.token, otherEventId, sceneId)
        }
    }

    /** Der eigentliche Kern des Task-Briefs: ein Board-Token derselben Veranstaltung öffnet keine Szene. */
    @Test
    fun aBoardTokenOfTheSameEventNeverOpensAScene() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val sceneId = (!StreamSceneService.createScene(eventId, sceneRequest("Rennen"))).dto.id
        val boardId = (!BoardService.createBoard(
            eventId,
            BoardRequest(
                name = "Anzeige Steg",
                config = BoardConfig(
                    columns = 1,
                    tiles = listOf(BoardTile(elements = listOf(BoardElement(type = BoardElementType.CLOCK)))),
                ),
            )
        )).dto.id

        val boardLink = (!TimingDeviceTokenService.shareLinkForBoard(eventId, boardId, userId)).dto
        val sceneLink = (!StreamSceneService.createShareLink(eventId, sceneId, userId)).dto

        // Board-Token oeffnet die Szene nicht ...
        assertKIOFails(TimingError.DeviceTokenInvalid) {
            TimingDeviceTokenService.validateForStreamScene(boardLink.token, eventId, sceneId)
        }
        // ... und umgekehrt oeffnet das Szenen-Token kein Board.
        assertKIOFails(TimingError.DeviceTokenInvalid) {
            TimingDeviceTokenService.validateForBoard(sceneLink.token, eventId, boardId)
        }
    }

    @Test
    fun aSceneTokenNeverOpensTheTimingSide() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val sceneId = (!StreamSceneService.createScene(eventId, sceneRequest("Rennen"))).dto.id

        val link = (!StreamSceneService.createShareLink(eventId, sceneId, userId)).dto

        assertKIOFails(TimingError.DeviceTokenInvalid) {
            TimingDeviceTokenService.validateForEvent(link.token, eventId)
        }
        assertKIOFails(TimingError.DeviceTokenInvalid) {
            TimingDeviceTokenService.validate(link.token, eventId, stationId)
        }
    }

    @Test
    fun aStationTokenNeverOpensAScene() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val sceneId = (!StreamSceneService.createScene(eventId, sceneRequest("Rennen"))).dto.id

        val station = (!TimingDeviceTokenService.shareLink(eventId, stationId, userId)).dto
        val manual = (!TimingDeviceTokenService.issue(
            eventId,
            TimingDeviceTokenRequest("Lichtschranke Ziel", stationId),
            userId,
        )).dto

        for (token in listOf(station.token, manual.token)) {
            assertKIOFails(TimingError.DeviceTokenInvalid) {
                TimingDeviceTokenService.validateForStreamScene(token, eventId, sceneId)
            }
        }
    }

    @Test
    fun theTimingDeviceTabKeepsShowingOnlyStationTokens() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val sceneId = (!StreamSceneService.createScene(eventId, sceneRequest("Rennen"))).dto.id

        val station = (!TimingDeviceTokenService.shareLink(eventId, stationId, userId)).dto
        !StreamSceneService.createShareLink(eventId, sceneId, userId)

        val listed = (!TimingDeviceTokenService.list(eventId)).data
        assertEquals(1, listed.size)
        assertEquals(station.deviceToken.id, listed.single().id)
    }

    // --- Widerruf mit UPDATE STREAM statt UPDATE EVENT ----------------------------------------
    //
    // `StreamSceneShareDialog` bietet den Widerruf jeder Nutzerin mit UPDATE STREAM an, nicht
    // nur UPDATE EVENT (timing.kt: `authenticateAny(UpdateEventGlobal, UpdateStreamGlobal)`).
    // `hasEventPrivilege` im Service bildet ab, ob die Route das volle Recht gesehen hat - `false`
    // steht hier für eine reine Streamer-Rolle. Der Zuschnitt ist derselbe wie bei den
    // Validierungsfunktionen oben: die eigene Szene ja, ein Posten- oder Board-Token nie.

    @Test
    fun aStreamOnlyPrivilegeMayRevokeItsOwnSceneToken() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val sceneId = (!StreamSceneService.createScene(eventId, sceneRequest("Rennen"))).dto.id
        val link = (!StreamSceneService.createShareLink(eventId, sceneId, userId)).dto

        !TimingDeviceTokenService.revoke(eventId, link.deviceTokenId, hasEventPrivilege = false)

        assertKIOFails(TimingError.DeviceTokenInvalid) {
            TimingDeviceTokenService.validateForStreamScene(link.token, eventId, sceneId)
        }
    }

    @Test
    fun aStreamOnlyPrivilegeMayNotRevokeAStationToken() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val station = (!TimingDeviceTokenService.shareLink(eventId, stationId, userId)).dto

        assertKIOFails(AuthError.PrivilegeMissing) {
            TimingDeviceTokenService.revoke(eventId, station.deviceToken.id, hasEventPrivilege = false)
        }
        // Unverändert gültig - der abgelehnte Versuch darf das Token nicht angekratzt haben.
        assertKIOSucceeds {
            TimingDeviceTokenService.validate(station.token, eventId, stationId)
        }
    }

    @Test
    fun aStreamOnlyPrivilegeMayNotRevokeABoardToken() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val boardId = (!BoardService.createBoard(
            eventId,
            BoardRequest(
                name = "Anzeige Steg",
                config = BoardConfig(
                    columns = 1,
                    tiles = listOf(BoardTile(elements = listOf(BoardElement(type = BoardElementType.CLOCK)))),
                ),
            )
        )).dto.id
        val board = (!TimingDeviceTokenService.shareLinkForBoard(eventId, boardId, userId)).dto

        assertKIOFails(AuthError.PrivilegeMissing) {
            TimingDeviceTokenService.revoke(eventId, board.deviceTokenId, hasEventPrivilege = false)
        }
    }

    @Test
    fun anUnknownSceneIsNotShareable() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val (otherEventId, _) = !createTestEventWithAdmin()
        val foreignSceneId = (!StreamSceneService.createScene(otherEventId, sceneRequest("Fremde Szene"))).dto.id
        val unknownSceneId = UUID.randomUUID()

        assertKIOFails(StreamError.SceneNotFound(unknownSceneId)) {
            StreamSceneService.createShareLink(eventId, unknownSceneId, userId)
        }
        assertKIOFails(StreamError.SceneNotFound(foreignSceneId)) {
            StreamSceneService.createShareLink(eventId, foreignSceneId, userId)
        }
    }
}
