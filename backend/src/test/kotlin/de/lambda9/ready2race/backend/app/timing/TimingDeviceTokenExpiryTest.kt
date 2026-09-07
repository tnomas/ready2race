package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.eventDay.control.EventDayRepo
import de.lambda9.ready2race.backend.app.eventInfo.boundary.BoardService
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardConfig
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardElement
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardElementType
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardRequest
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardTile
import de.lambda9.ready2race.backend.app.stream.boundary.StreamSceneService
import de.lambda9.ready2race.backend.app.stream.entity.StreamBackground
import de.lambda9.ready2race.backend.app.stream.entity.StreamSceneRequest
import de.lambda9.ready2race.backend.app.timing.boundary.TimingDeviceTokenService
import de.lambda9.ready2race.backend.app.timing.control.TimingDeviceTokenRepo
import de.lambda9.ready2race.backend.app.timing.entity.TimingDeviceTokenRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingError
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationType
import de.lambda9.ready2race.backend.database.generated.tables.records.EventDayRecord
import de.lambda9.ready2race.testing.testComprehension
import java.time.Duration
import java.time.LocalDate
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Das Ablaufdatum der Link-Tokens (Migration V202609071000).
 *
 * Ein geteilter Link ist Bearer-Material: wer die Adresse einmal gesehen hat, sah bisher für
 * immer hinein. Link-Tokens laufen deshalb ab - mit dem Tag nach dem letzten Veranstaltungstag,
 * sonst 30 Tage nach dem Ausstellen. Manuell ausgestellte Hardware-Tokens bleiben ohne Ablauf,
 * weil sie in Gerätekonfigurationen liegen, die niemand nach jeder Regatta neu einspielt.
 */
class TimingDeviceTokenExpiryTest {

    private fun boardRequest(name: String) = BoardRequest(
        name = name,
        config = BoardConfig(
            columns = 1,
            tiles = listOf(BoardTile(elements = listOf(BoardElement(type = BoardElementType.CLOCK)))),
        ),
    )

    private fun sceneRequest(name: String) = StreamSceneRequest(name = name, background = StreamBackground.TRANSPARENT)

    private fun eventDay(eventId: UUID, userId: UUID, date: LocalDate) = EventDayRecord(
        id = UUID.randomUUID(),
        event = eventId,
        date = date,
        createdAt = LocalDateTime.now(),
        createdBy = userId,
        updatedAt = LocalDateTime.now(),
        updatedBy = userId,
    )

    private fun assertRoughlyThirtyDaysFromNow(expiresAt: LocalDateTime?) {
        assertNotNull(expiresAt)
        val distance = Duration.between(LocalDateTime.now().plusDays(30), expiresAt).abs()
        assertTrue(distance < Duration.ofMinutes(5), "expected ~30 days from now, got $expiresAt")
    }

    @Test
    fun manualHardwareTokensNeverExpire() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)
        !EventDayRepo.create(eventDay(eventId, userId, LocalDate.now().plusDays(1)))

        val issued = (!TimingDeviceTokenService.issue(
            eventId,
            TimingDeviceTokenRequest("Lichtschranke Ziel", stationId),
            userId,
        )).dto

        assertNull(issued.deviceToken.expiresAt)
        assertNull((!TimingDeviceTokenRepo.get(issued.deviceToken.id))!!.expiresAt)
    }

    @Test
    fun stationLinkExpiresTheDayAfterTheLastEventDay() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)
        val lastDay = LocalDate.now().plusDays(9)
        // Absichtlich nicht chronologisch eingefügt: der letzte Tag entscheidet, nicht der zuletzt
        // angelegte.
        !EventDayRepo.create(eventDay(eventId, userId, lastDay))
        !EventDayRepo.create(eventDay(eventId, userId, lastDay.minusDays(2)))

        val link = (!TimingDeviceTokenService.shareLink(eventId, stationId, userId)).dto

        // Ende des letzten Veranstaltungstags (= Beginn des Folgetags) plus ein Tag Karenz: der
        // Folgetag ist noch komplett drin, danach ist der Link tot.
        val expected = lastDay.plusDays(2).atStartOfDay()
        assertEquals(expected, link.deviceToken.expiresAt)
        assertEquals(expected, (!TimingDeviceTokenRepo.get(link.deviceToken.id))!!.expiresAt)
    }

    @Test
    fun linksWithoutEventDaysExpireInThirtyDays() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)

        val link = (!TimingDeviceTokenService.shareLink(eventId, stationId, userId)).dto

        assertRoughlyThirtyDaysFromNow(link.deviceToken.expiresAt)
    }

    @Test
    fun linksSharedAfterTheEventFallBackToThirtyDays() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)
        !EventDayRepo.create(eventDay(eventId, userId, LocalDate.now().minusDays(10)))

        // Ein Link, der schon beim Ausstellen abgelaufen wäre, nützt niemandem - etwa für eine
        // Ergebnisanzeige in der Woche nach der Regatta.
        val link = (!TimingDeviceTokenService.shareLink(eventId, stationId, userId)).dto

        assertRoughlyThirtyDaysFromNow(link.deviceToken.expiresAt)
    }

    @Test
    fun boardAndSceneLinksExpireLikeStationLinks() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val lastDay = LocalDate.now().plusDays(3)
        !EventDayRepo.create(eventDay(eventId, userId, lastDay))
        val boardId = (!BoardService.createBoard(eventId, boardRequest("Anzeige Steg"))).dto.id
        val sceneId = (!StreamSceneService.createScene(eventId, sceneRequest("Rennen"))).dto.id

        val board = (!TimingDeviceTokenService.shareLinkForBoard(eventId, boardId, userId)).dto
        val scene = (!TimingDeviceTokenService.shareLinkForStreamScene(eventId, sceneId, userId)).dto

        val expected = lastDay.plusDays(2).atStartOfDay()
        assertEquals(expected, (!TimingDeviceTokenRepo.get(board.deviceTokenId))!!.expiresAt)
        assertEquals(expected, (!TimingDeviceTokenRepo.get(scene.deviceTokenId))!!.expiresAt)
    }

    @Test
    fun expiredTokensAreRejectedByEveryValidation() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val boardId = (!BoardService.createBoard(eventId, boardRequest("Anzeige Steg"))).dto.id
        val sceneId = (!StreamSceneService.createScene(eventId, sceneRequest("Rennen"))).dto.id
        val station = (!TimingDeviceTokenService.shareLink(eventId, stationId, userId)).dto
        val board = (!TimingDeviceTokenService.shareLinkForBoard(eventId, boardId, userId)).dto
        val scene = (!TimingDeviceTokenService.shareLinkForStreamScene(eventId, sceneId, userId)).dto

        // Vor dem Ablauf gehen alle Wege auf ...
        assertKIOSucceeds { TimingDeviceTokenService.validate(station.token, eventId, stationId) }
        assertKIOSucceeds { TimingDeviceTokenService.validateForEvent(station.token, eventId) }
        assertKIOSucceeds { TimingDeviceTokenService.validateForBoard(board.token, eventId, boardId) }
        assertKIOSucceeds { TimingDeviceTokenService.validateBoardTokenForEvent(board.token, eventId) }
        assertKIOSucceeds { TimingDeviceTokenService.validateForStreamScene(scene.token, eventId, sceneId) }

        val past = LocalDateTime.now().minusMinutes(1)
        for (id in listOf(station.deviceToken.id, board.deviceTokenId, scene.deviceTokenId)) {
            !TimingDeviceTokenRepo.update(id) { expiresAt = past }
        }

        // ... danach keiner mehr, mit derselben opaken Antwort wie jede andere Ablehnung.
        assertKIOFails(TimingError.DeviceTokenInvalid) {
            TimingDeviceTokenService.validate(station.token, eventId, stationId)
        }
        assertKIOFails(TimingError.DeviceTokenInvalid) {
            TimingDeviceTokenService.validateForEvent(station.token, eventId)
        }
        assertKIOFails(TimingError.DeviceTokenInvalid) {
            TimingDeviceTokenService.validateForBoard(board.token, eventId, boardId)
        }
        assertKIOFails(TimingError.DeviceTokenInvalid) {
            TimingDeviceTokenService.validateBoardTokenForEvent(board.token, eventId)
        }
        assertKIOFails(TimingError.DeviceTokenInvalid) {
            TimingDeviceTokenService.validateForStreamScene(scene.token, eventId, sceneId)
        }
    }

    @Test
    fun anExpiredLinkIsNotReusedOnTheNextClick() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)
        val first = (!TimingDeviceTokenService.shareLink(eventId, stationId, userId)).dto
        !TimingDeviceTokenRepo.update(first.deviceToken.id) { expiresAt = LocalDateTime.now().minusMinutes(1) }

        val second = (!TimingDeviceTokenService.shareLink(eventId, stationId, userId)).dto

        // Wiederverwendung gilt nur für lebende Tokens - ein abgelaufener Link wäre als Antwort
        // wertlos. Das frische Token lebt, und der dritte Klick liefert wieder dasselbe.
        assertNotEquals(first.deviceToken.id, second.deviceToken.id)
        assertNotEquals(first.token, second.token)
        assertRoughlyThirtyDaysFromNow(second.deviceToken.expiresAt)
        val third = (!TimingDeviceTokenService.shareLink(eventId, stationId, userId)).dto
        assertEquals(second.deviceToken.id, third.deviceToken.id)
    }
}
