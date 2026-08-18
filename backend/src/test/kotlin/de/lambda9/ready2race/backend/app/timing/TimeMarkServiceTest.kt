package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.timing.boundary.TimingBroadcaster
import de.lambda9.ready2race.backend.app.timing.boundary.TimingService
import de.lambda9.ready2race.backend.app.timing.control.TimingAssignmentRepo
import de.lambda9.ready2race.backend.app.timing.control.TimingTimeMarkRepo
import de.lambda9.ready2race.backend.app.timing.entity.*
import de.lambda9.ready2race.backend.app.timingConfig.entity.TimingSystem
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingTimeMarkRecord
import de.lambda9.ready2race.testing.testComprehension
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class TimeMarkServiceTest {

    @Test
    fun createIsIdempotent() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)
        val markId = UUID.randomUUID()
        val request = CreateTimeMarkRequest(id = markId, station = stationId, timestampMillis = 1755430000000)

        !TimingService.createTimeMark(request, userId, eventId)
        !TimingService.createTimeMark(request, userId, eventId) // second call must succeed, no duplicate

        val marks = !TimingTimeMarkRepo.getByEvent(eventId)
        assertEquals(1, marks.size)
        assertEquals(markId, marks.first().id)
    }

    @Test
    fun createIfAbsentIsRaceSafe() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)
        val markId = UUID.randomUUID()
        val record = TimingTimeMarkRecord(
            id = markId,
            event = eventId,
            station = stationId,
            timestampMillis = 1755430000000,
            source = "APP_USER",
            status = "ACTIVE",
            createdAt = LocalDateTime.now(),
            createdBy = userId,
        )

        // Simulates the loser of a concurrent-insert race: the row already exists
        // (e.g. inserted by another request with the same client-generated id),
        // so this second insert must hit ON CONFLICT DO NOTHING instead of
        // throwing a primary-key-violation defect.
        !TimingTimeMarkRepo.createIfAbsent(record)
        !TimingTimeMarkRepo.createIfAbsent(record)

        val marks = !TimingTimeMarkRepo.getByEvent(eventId)
        assertEquals(1, marks.size)
        assertEquals(markId, marks.first().id)
    }

    // The broadcast is guarded by `if (inserted > 0)`, so neither the idempotent fast path
    // (`exists` == true, asserted here) nor the loser of a real insert race (same guard, see
    // createIfAbsentIsRaceSafe) emits a second message. The race-loser variant itself cannot be
    // provoked from a single transaction - TimingSocketTest covers it with two concurrent requests.
    @Test
    fun duplicateCreateBroadcastsOnlyOnce() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)
        val received = TimingBroadcasterTest.concurrentList()
        val subscription = TimingBroadcaster.subscribe(eventId) { received.add(it) }

        try {
            val request = CreateTimeMarkRequest(UUID.randomUUID(), stationId, 1755430000000)
            !TimingService.createTimeMark(request, userId, eventId)
            !TimingService.createTimeMark(request, userId, eventId)

            runBlocking {
                TimingBroadcasterTest.awaitSize(received, 1)
                delay(200)
            }
            assertEquals(1, received.size, "duplicate create must not broadcast again: $received")
            assertTrue(received.single().contains("timeMarkCreated"))
        } finally {
            TimingBroadcaster.unsubscribe(subscription)
        }
    }

    @Test
    fun retractKeepsMark() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)
        val markId = UUID.randomUUID()
        !TimingService.createTimeMark(CreateTimeMarkRequest(markId, stationId, 1755430000000), userId, eventId)

        !TimingService.retractTimeMark(markId, eventId, userId)

        val mark = !TimingTimeMarkRepo.get(markId)
        assertNotNull(mark)
        assertEquals("RETRACTED", mark.status)
        assertEquals(userId, mark.updatedBy)
        assertNotNull(mark.updatedAt)
    }

    @Test
    fun retractFailsForUnknownTimeMark() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()

        assertKIOFails(TimingError.TimeMarkNotFound) {
            TimingService.retractTimeMark(UUID.randomUUID(), eventId, userId)
        }
    }

    // NOTE: full team-assignment round-trip coverage (upsert + detach against a
    // real competition_match_team) lives in TimingStateTest, which owns the
    // createTestMatchTeam fixture that builds the competition_setup/-match chain.
    @Test
    fun assignFailsForUnknownTimeMark() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()

        assertKIOFails(TimingError.TimeMarkNotFound) {
            TimingService.assignTimeMark(AssignTimeMarkRequest(UUID.randomUUID()), userId, UUID.randomUUID(), eventId)
        }
    }

    @Test
    fun assignFailsForUnknownTeam() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)
        val markId = UUID.randomUUID()
        !TimingService.createTimeMark(CreateTimeMarkRequest(markId, stationId, 1755430000000), userId, eventId)

        assertKIOFails(TimingError.TeamNotFound) {
            TimingService.assignTimeMark(AssignTimeMarkRequest(UUID.randomUUID()), userId, markId, eventId)
        }
    }

    @Test
    fun assignFailsForTeamFromDifferentEvent() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val (otherEventId, _) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)
        val markId = UUID.randomUUID()
        !TimingService.createTimeMark(CreateTimeMarkRequest(markId, stationId, 1755430000000), userId, eventId)
        val teamFromOtherEvent = !createTestMatchTeam(otherEventId)

        assertKIOFails(TimingError.EventMismatch) {
            TimingService.assignTimeMark(AssignTimeMarkRequest(teamFromOtherEvent), userId, markId, eventId)
        }
    }

    // Structural protection against the RaceClocker lap wipe: assigning runs the lap sync, which
    // rewrites a boat's laps from the internal marks alone. On a boat whose laps come from the
    // RaceClocker feed, one mis-tap would erase them - so the assignment itself is refused.
    @Test
    fun assignFailsForATeamOfAnotherTimingSystem() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)
        val markId = UUID.randomUUID()
        !TimingService.createTimeMark(CreateTimeMarkRequest(markId, stationId, 1755430000000), userId, eventId)
        val foreignTeam = !createTestMatchTeam(eventId, TimingSystem.RACECLOCKER)

        assertKIOFails(TimingError.WrongTimingSystem) {
            TimingService.assignTimeMark(AssignTimeMarkRequest(foreignTeam), userId, markId, eventId)
        }
        assertNull(!TimingAssignmentRepo.getByTimeMark(markId))
    }

    @Test
    fun detachWithoutExistingAssignmentSucceeds() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)
        val markId = UUID.randomUUID()
        !TimingService.createTimeMark(CreateTimeMarkRequest(markId, stationId, 1755430000000), userId, eventId)

        !TimingService.assignTimeMark(AssignTimeMarkRequest(null), userId, markId, eventId)

        val assignment = !TimingAssignmentRepo.getByTimeMark(markId)
        assertNull(assignment)
    }

    @Test
    fun deleteStationFailsWhenStationHasTimeMarks() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)
        !TimingService.createTimeMark(
            CreateTimeMarkRequest(UUID.randomUUID(), stationId, 1755430000000),
            userId,
            eventId,
        )

        assertKIOFails(TimingError.StationHasTimeMarks) {
            TimingService.deleteStation(stationId, eventId)
        }
    }
}
