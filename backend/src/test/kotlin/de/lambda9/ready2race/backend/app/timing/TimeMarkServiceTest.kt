package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.timing.boundary.TimingService
import de.lambda9.ready2race.backend.app.timing.control.TimingAssignmentRepo
import de.lambda9.ready2race.backend.app.timing.control.TimingTimeMarkRepo
import de.lambda9.ready2race.backend.app.timing.entity.*
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingTimeMarkRecord
import de.lambda9.ready2race.testing.testComprehension
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

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

    @Test
    fun retractKeepsMark() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)
        val markId = UUID.randomUUID()
        !TimingService.createTimeMark(CreateTimeMarkRequest(markId, stationId, 1755430000000), userId, eventId)

        !TimingService.retractTimeMark(markId, eventId)

        val mark = !TimingTimeMarkRepo.get(markId)
        assertNotNull(mark)
        assertEquals("RETRACTED", mark.status)
    }

    @Test
    fun retractFailsForUnknownTimeMark() = testComprehension {
        val (eventId, _) = !createTestEventWithAdmin()

        assertKIOFails(TimingError.TimeMarkNotFound) {
            TimingService.retractTimeMark(UUID.randomUUID(), eventId)
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
            TimingService.deleteStation(stationId)
        }
    }
}
