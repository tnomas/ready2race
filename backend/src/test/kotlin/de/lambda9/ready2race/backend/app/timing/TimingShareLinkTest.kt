package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.timing.boundary.TimingDeviceTokenService
import de.lambda9.ready2race.backend.app.timing.entity.TimingDeviceTokenRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingError
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationType
import de.lambda9.ready2race.testing.testComprehension
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

/**
 * Der Posten-Share-Link: ein Klick stellt automatisch ein Geräte-Token aus, der nächste Klick
 * liefert DENSELBEN Link (Wiederverwendung statt Inflation), erst der Widerruf im Geräte-Reiter
 * erzwingt ein frisches Token. Manuell ausgestellte Hardware-Tokens bleiben davon unberührt.
 */
class TimingShareLinkTest {

    @Test
    fun secondClickReturnsTheSameTokenAndLink() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.FINISH)

        val first = (!TimingDeviceTokenService.shareLink(eventId, stationId, userId)).dto
        val second = (!TimingDeviceTokenService.shareLink(eventId, stationId, userId)).dto

        assertEquals(first.token, second.token)
        assertEquals(first.deviceToken.id, second.deviceToken.id)
        assertEquals(first.path, second.path)
        assertTrue(first.deviceToken.autoIssued)
        assertTrue(first.path.startsWith("/event/$eventId/timing/$stationId?token="))

        // Und der Geräte-Reiter führt genau EIN Token für den Posten.
        val listed = (!TimingDeviceTokenService.list(eventId)).data
        assertEquals(1, listed.size)
    }

    @Test
    fun theLinkTokenAuthenticatesReads() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.FINISH)

        val link = (!TimingDeviceTokenService.shareLink(eventId, stationId, userId)).dto

        // Das ausgestellte Token ist ein ganz normales Geräte-Token: dieselbe Validierung, die
        // alle Lesewege benutzen, akzeptiert es.
        assertKIOSucceeds {
            TimingDeviceTokenService.validateForEvent(link.token, eventId)
        }
    }

    @Test
    fun revokeForcesAFreshTokenOnTheNextClick() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.FINISH)

        val first = (!TimingDeviceTokenService.shareLink(eventId, stationId, userId)).dto
        !TimingDeviceTokenService.revoke(eventId, first.deviceToken.id)

        // Das alte Token ist tot ...
        assertKIOFails(TimingError.DeviceTokenInvalid) {
            TimingDeviceTokenService.validateForEvent(first.token, eventId)
        }

        // ... und der nächste Klick stellt ein neues aus.
        val second = (!TimingDeviceTokenService.shareLink(eventId, stationId, userId)).dto
        assertNotEquals(first.token, second.token)
        assertNotEquals(first.deviceToken.id, second.deviceToken.id)
    }

    @Test
    fun manualTokensAreNeverReusedAsShareLinks() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val manual = (!TimingDeviceTokenService.issue(
            eventId,
            TimingDeviceTokenRequest("Lichtschranke Ziel", stationId),
            userId,
        )).dto

        val link = (!TimingDeviceTokenService.shareLink(eventId, stationId, userId)).dto

        // Der Klartext des Hardware-Tokens existiert nur in dessen Ausstell-Antwort - der
        // Share-Link kann und darf ihn nicht wiederverwenden.
        assertNotEquals(manual.deviceToken.id, link.deviceToken.id)
        assertEquals(false, manual.deviceToken.autoIssued)
        assertTrue(link.deviceToken.autoIssued)
    }

    @Test
    fun anzeigeStationsLinkToTheDisplayRoute() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val displayId = !addTestStation(eventId, userId, TimingStationType.ANZEIGE)

        val link = (!TimingDeviceTokenService.shareLink(eventId, displayId, userId)).dto

        assertTrue(link.path.startsWith("/event/$eventId/timing/$displayId/anzeige?token="))
    }

    @Test
    fun stationOfAnotherEventIsRejected() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val (otherEventId, _) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.FINISH)

        assertKIOFails(TimingError.EventMismatch) {
            TimingDeviceTokenService.shareLink(otherEventId, stationId, userId)
        }
    }
}
