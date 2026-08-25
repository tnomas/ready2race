package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.timing.boundary.TimingDeviceTokenService
import de.lambda9.ready2race.backend.app.timing.boundary.TimingService
import de.lambda9.ready2race.backend.app.timing.control.TimingDeviceTokenRepo
import de.lambda9.ready2race.backend.app.timing.control.TimingTimeMarkRepo
import de.lambda9.ready2race.backend.app.timing.entity.*
import de.lambda9.ready2race.testing.testComprehension
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Station-scoped hardware device tokens: the plaintext token is handed out exactly once, only its
 * hash is stored, and a valid token may capture marks for its own station only.
 */
class TimingDeviceTokenServiceTest {

    @Test
    fun issueReturnsPlaintextOnceAndStoresOnlyTheHash() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)

        val issued = (!TimingDeviceTokenService.issue(
            eventId,
            TimingDeviceTokenRequest(name = "Finish beam", station = stationId),
            userId,
        )).dto

        assertTrue(issued.token.length >= 30)
        val stored = !TimingDeviceTokenRepo.get(issued.deviceToken.id)
        assertNotNull(stored)
        assertFalse(stored.tokenHash.contains(issued.token), "the plaintext token must never be stored")
        assertEquals(64, stored.tokenHash.length, "expected a hex-encoded SHA-256 digest")
        assertEquals(stationId, stored.station)
        assertEquals("Finish beam", stored.name)
        assertFalse(stored.revoked!!)

        // The plaintext is never retrievable again - the list view only knows the metadata.
        val listed = (!TimingDeviceTokenService.list(eventId)).data.single()
        assertEquals(issued.deviceToken.id, listed.id)
        assertEquals("Finish beam", listed.name)
        assertEquals(stationId, listed.station)
        assertFalse(listed.revoked)
    }

    @Test
    fun validateAcceptsTheIssuedTokenForItsStation() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)
        val issued = (!TimingDeviceTokenService.issue(
            eventId,
            TimingDeviceTokenRequest("Finish beam", stationId),
            userId,
        )).dto

        val record = !TimingDeviceTokenService.validate(issued.token, eventId, stationId)

        assertEquals(issued.deviceToken.id, record.id)
    }

    @Test
    fun validateRejectsUnknownToken() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)

        assertKIOFails(TimingError.DeviceTokenInvalid) {
            TimingDeviceTokenService.validate("not-a-real-token", eventId, stationId)
        }
    }

    @Test
    fun validateRejectsTokenOfAnotherStation() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)
        val otherStationId = !addTestStation(eventId, userId)
        val issued = (!TimingDeviceTokenService.issue(
            eventId,
            TimingDeviceTokenRequest("Finish beam", stationId),
            userId,
        )).dto

        assertKIOFails(TimingError.DeviceTokenInvalid) {
            TimingDeviceTokenService.validate(issued.token, eventId, otherStationId)
        }
    }

    @Test
    fun validateRejectsTokenOfAnotherEvent() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val (otherEventId, _) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)
        val issued = (!TimingDeviceTokenService.issue(
            eventId,
            TimingDeviceTokenRequest("Finish beam", stationId),
            userId,
        )).dto

        assertKIOFails(TimingError.DeviceTokenInvalid) {
            TimingDeviceTokenService.validate(issued.token, otherEventId, stationId)
        }
    }

    @Test
    fun revokedTokenNoLongerValidates() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)
        val issued = (!TimingDeviceTokenService.issue(
            eventId,
            TimingDeviceTokenRequest("Finish beam", stationId),
            userId,
        )).dto

        !TimingDeviceTokenService.revoke(eventId, issued.deviceToken.id)

        assertTrue((!TimingDeviceTokenRepo.get(issued.deviceToken.id))!!.revoked!!)
        assertKIOFails(TimingError.DeviceTokenInvalid) {
            TimingDeviceTokenService.validate(issued.token, eventId, stationId)
        }
    }

    @Test
    fun revokeFailsForTokenOfAnotherEvent() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val (otherEventId, otherUserId) = !createTestEventWithAdmin()
        val otherStation = !addTestStation(otherEventId, otherUserId)
        val issued = (!TimingDeviceTokenService.issue(
            otherEventId,
            TimingDeviceTokenRequest("Finish beam", otherStation),
            otherUserId,
        )).dto

        assertKIOFails(TimingError.EventMismatch) {
            TimingDeviceTokenService.revoke(eventId, issued.deviceToken.id)
        }
    }

    @Test
    fun issueFailsForStationOfAnotherEvent() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val (otherEventId, otherUserId) = !createTestEventWithAdmin()
        val otherStation = !addTestStation(otherEventId, otherUserId)

        assertKIOFails(TimingError.EventMismatch) {
            TimingDeviceTokenService.issue(eventId, TimingDeviceTokenRequest("beam", otherStation), userId)
        }
    }

    @Test
    fun revokeFailsForUnknownToken() = testComprehension {
        val (eventId, _) = !createTestEventWithAdmin()

        assertKIOFails(TimingError.DeviceTokenNotFound) {
            TimingDeviceTokenService.revoke(eventId, UUID.randomUUID())
        }
    }

    // --- validateForEvent: Geräte-Token als Lese-Zugang für geteilte Posten-Links -------------
    //
    // Ein per Link geteiltes Erfassungs- bzw. Startbildschirm-Gerät muss den Zustand der ganzen
    // Veranstaltung lesen dürfen (Posten, Marken, aktive Sequenz) - dieselbe Sichtbarkeit, die
    // jede angemeldete Zeitnahme-Rolle hat. Schreiben bleibt weiterhin auf die Posten-Bindung
    // von `validate` (Zeitmarken) bzw. auf echte Sitzungen beschränkt.

    @Test
    fun validateForEventAcceptsTheTokenForAnyStationOfItsEvent() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)
        val issued = (!TimingDeviceTokenService.issue(
            eventId,
            TimingDeviceTokenRequest("Finish beam", stationId),
            userId,
        )).dto

        val record = !TimingDeviceTokenService.validateForEvent(issued.token, eventId)

        assertEquals(issued.deviceToken.id, record.id)
    }

    @Test
    fun validateForEventRejectsTokenOfAnotherEvent() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val (otherEventId, _) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)
        val issued = (!TimingDeviceTokenService.issue(
            eventId,
            TimingDeviceTokenRequest("Finish beam", stationId),
            userId,
        )).dto

        assertKIOFails(TimingError.DeviceTokenInvalid) {
            TimingDeviceTokenService.validateForEvent(issued.token, otherEventId)
        }
    }

    @Test
    fun validateForEventRejectsUnknownAndRevokedTokens() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)
        val issued = (!TimingDeviceTokenService.issue(
            eventId,
            TimingDeviceTokenRequest("Finish beam", stationId),
            userId,
        )).dto

        assertKIOFails(TimingError.DeviceTokenInvalid) {
            TimingDeviceTokenService.validateForEvent("not-a-real-token", eventId)
        }

        !TimingDeviceTokenService.revoke(eventId, issued.deviceToken.id)
        assertKIOFails(TimingError.DeviceTokenInvalid) {
            TimingDeviceTokenService.validateForEvent(issued.token, eventId)
        }
    }

    @Test
    fun hardwareMarkIsRecordedWithHardwareSourceAndNoUser() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)
        val markId = UUID.randomUUID()

        !TimingService.createHardwareTimeMark(
            CreateTimeMarkRequest(markId, stationId, 1755430000000),
            eventId,
        )

        val mark = !TimingTimeMarkRepo.get(markId)
        assertNotNull(mark)
        assertEquals("HARDWARE", mark.source)
        assertEquals("ACTIVE", mark.status)
        assertNull(mark.createdBy)
    }
}
