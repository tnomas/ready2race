package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.timing.boundary.TimingSequenceService
import de.lambda9.ready2race.backend.app.timing.control.TimingAssignmentRepo
import de.lambda9.ready2race.backend.app.timing.control.TimingSequenceEntryRepo
import de.lambda9.ready2race.backend.app.timing.control.TimingSequenceRepo
import de.lambda9.ready2race.backend.app.timing.control.TimingTimeMarkRepo
import de.lambda9.ready2race.backend.app.timing.entity.ActiveSequenceDto
import de.lambda9.ready2race.backend.app.timing.entity.CreateSequenceRequest
import de.lambda9.ready2race.backend.app.timing.entity.SequenceEntryStatus
import de.lambda9.ready2race.backend.app.timing.entity.SequenceMode
import de.lambda9.ready2race.backend.app.timing.entity.SequenceState
import de.lambda9.ready2race.backend.app.timing.entity.TimingError
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationType
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingStartSequenceRecord
import de.lambda9.ready2race.testing.testComprehension
import de.lambda9.tailwind.core.extensions.kio.orDie
import java.time.LocalDateTime
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class TimingSequenceServiceTest {

    @Test
    fun createAndGetActiveRoundTrip() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val teamA = !createTestMatchTeam(eventId)
        val teamB = !createTestMatchTeam(eventId)

        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.INTERVAL, 60000, listOf(teamA, teamB)),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id

        val response = !TimingSequenceService.getActiveSequence(eventId, stationId)
        val dto = ((response as ApiResponse.Dto<ActiveSequenceDto>).dto).sequence

        assertNotNull(dto)
        assertEquals(sequenceId, dto.id)
        assertEquals(SequenceState.ARMED, dto.state)
        assertEquals(SequenceMode.INTERVAL, dto.mode)
        assertEquals(60000L, dto.intervalMillis)
        assertNull(dto.startedAtMillis)
        assertEquals(listOf(teamA, teamB), dto.entries.map { it.competitionMatchTeam })
        assertEquals(listOf(0, 1), dto.entries.map { it.position })
        // Not started yet, so nothing is scheduled.
        assertTrue(dto.entries.all { it.plannedStartMillis == null })
    }

    @Test
    fun getActiveReturnsNothingWithoutSequence() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)

        val response = !TimingSequenceService.getActiveSequence(eventId, stationId)
        assertNull(((response as ApiResponse.Dto<ActiveSequenceDto>).dto).sequence)
    }

    @Test
    fun createSequenceRejectsNonStartStation() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val team = !createTestMatchTeam(eventId)

        assertKIOFails(TimingError.StationNotStartType) {
            TimingSequenceService.createSequence(
                CreateSequenceRequest(stationId, SequenceMode.MASS, null, listOf(team)),
                userId,
                eventId,
            )
        }
    }

    @Test
    fun createSequenceRejectsSecondActiveSequenceOnSameStation() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val team = !createTestMatchTeam(eventId)
        val request = CreateSequenceRequest(stationId, SequenceMode.MASS, null, listOf(team))

        !TimingSequenceService.createSequence(request, userId, eventId)

        assertKIOFails(TimingError.SequenceAlreadyActive) {
            TimingSequenceService.createSequence(request, userId, eventId)
        }
    }

    @Test
    fun intervalSequenceFiresOnlyDueEntries() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val teamA = !createTestMatchTeam(eventId)
        val teamB = !createTestMatchTeam(eventId)

        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.INTERVAL, 1000, listOf(teamA, teamB)),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id
        !TimingSequenceService.startSequence(sequenceId, userId, eventId)

        // Position 0 is 500ms overdue, position 1 is still 500ms away.
        val firstStart = System.currentTimeMillis() - 500
        !shiftStart(sequenceId, firstStart)

        val firstRun = !TimingSequenceService.fireDueEntries()
        assertEquals(1, firstRun.fired.size)
        assertEquals(teamA, firstRun.fired.single().mark.assignedTeam)
        assertEquals(firstStart, firstRun.fired.single().mark.timestampMillis)

        val afterFirst = !TimingSequenceEntryRepo.getBySequence(sequenceId).orDie()
        assertEquals(
            listOf(SequenceEntryStatus.STARTED.name, SequenceEntryStatus.PENDING.name),
            afterFirst.sortedBy { it.position }.map { it.status },
        )
        val stillRunning = !TimingSequenceRepo.get(sequenceId).orDie()
        assertEquals(SequenceState.RUNNING.name, stillRunning!!.state)

        // Now position 1 is due as well.
        val secondStart = System.currentTimeMillis() - 1500
        !shiftStart(sequenceId, secondStart)

        val secondRun = !TimingSequenceService.fireDueEntries()
        assertEquals(1, secondRun.fired.size)
        assertEquals(teamB, secondRun.fired.single().mark.assignedTeam)
        assertEquals(secondStart + 1000, secondRun.fired.single().mark.timestampMillis)

        val done = !TimingSequenceRepo.get(sequenceId).orDie()
        assertEquals(SequenceState.DONE.name, done!!.state)
        assertEquals(SequenceState.DONE, secondRun.changedSequences.single().state)
    }

    @Test
    fun firingCreatesMarkAndAssignment() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val team = !createTestMatchTeam(eventId)

        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.MASS, null, listOf(team)),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id
        !TimingSequenceService.startSequence(sequenceId, userId, eventId)
        val startedAt = System.currentTimeMillis() - 100
        !shiftStart(sequenceId, startedAt)

        val result = !TimingSequenceService.fireDueEntries()
        val fired = result.fired.single()

        val mark = !TimingTimeMarkRepo.get(fired.mark.id).orDie()
        assertNotNull(mark)
        assertEquals(stationId, mark.station)
        assertEquals(eventId, mark.event)
        assertEquals(startedAt, mark.timestampMillis)
        assertEquals("ACTIVE", mark.status)

        val assignment = !TimingAssignmentRepo.getByTimeMark(mark.id).orDie()
        assertNotNull(assignment)
        assertEquals(team, assignment.competitionMatchTeam)

        val entry = !TimingSequenceEntryRepo.get(fired.entryId).orDie()
        assertEquals(mark.id, entry!!.timeMark)
    }

    @Test
    fun massSequenceFiresEveryEntryAtOnce() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val teamA = !createTestMatchTeam(eventId)
        val teamB = !createTestMatchTeam(eventId)

        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.MASS, null, listOf(teamA, teamB)),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id
        !TimingSequenceService.startSequence(sequenceId, userId, eventId)
        val startedAt = System.currentTimeMillis() - 100
        !shiftStart(sequenceId, startedAt)

        val result = !TimingSequenceService.fireDueEntries()

        assertEquals(2, result.fired.size)
        // One signal starts all: identical timestamps.
        assertEquals(setOf(startedAt), result.fired.map { it.mark.timestampMillis }.toSet())
        assertEquals(setOf(teamA, teamB), result.fired.mapNotNull { it.mark.assignedTeam }.toSet())

        val done = !TimingSequenceRepo.get(sequenceId).orDie()
        assertEquals(SequenceState.DONE.name, done!!.state)
    }

    @Test
    fun skippedEntryKeepsCadence() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val teamA = !createTestMatchTeam(eventId)
        val teamB = !createTestMatchTeam(eventId)

        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.INTERVAL, 1000, listOf(teamA, teamB)),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id
        val entries = (!TimingSequenceEntryRepo.getBySequence(sequenceId).orDie()).sortedBy { it.position }
        !TimingSequenceService.skipEntry(entries.first().id, userId, eventId)
        !TimingSequenceService.startSequence(sequenceId, userId, eventId)

        // The skipped slot at position 0 has passed - position 1 must NOT move up into it.
        val firstStart = System.currentTimeMillis() - 500
        !shiftStart(sequenceId, firstStart)
        val firstRun = !TimingSequenceService.fireDueEntries()
        assertEquals(0, firstRun.fired.size)

        val secondStart = System.currentTimeMillis() - 1500
        !shiftStart(sequenceId, secondStart)
        val secondRun = !TimingSequenceService.fireDueEntries()

        assertEquals(1, secondRun.fired.size)
        assertEquals(teamB, secondRun.fired.single().mark.assignedTeam)
        assertEquals(secondStart + 1000, secondRun.fired.single().mark.timestampMillis)

        val sequence = secondRun.changedSequences.single()
        assertEquals(SequenceState.DONE, sequence.state)
        assertEquals(SequenceEntryStatus.SKIPPED, sequence.entries.first().status)
        assertEquals(secondStart, sequence.entries.first().plannedStartMillis)
        assertEquals(secondStart + 1000, sequence.entries[1].plannedStartMillis)
    }

    @Test
    fun rerunningFireIsIdempotent() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val team = !createTestMatchTeam(eventId)

        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.MASS, null, listOf(team)),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id
        !TimingSequenceService.startSequence(sequenceId, userId, eventId)
        !shiftStart(sequenceId, System.currentTimeMillis() - 100)

        assertEquals(1, (!TimingSequenceService.fireDueEntries()).fired.size)
        // The sequence is DONE now, so a second run must be a no-op - no duplicate marks.
        assertEquals(0, (!TimingSequenceService.fireDueEntries()).fired.size)
        assertEquals(1, (!TimingTimeMarkRepo.getByEvent(eventId).orDie()).size)
    }

    @Test
    fun startingTwiceConflicts() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val team = !createTestMatchTeam(eventId)

        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.MASS, null, listOf(team)),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id
        !TimingSequenceService.startSequence(sequenceId, userId, eventId)

        assertKIOFails(TimingError.SequenceStateConflict) {
            TimingSequenceService.startSequence(sequenceId, userId, eventId)
        }
    }

    @Test
    fun abortStopsPendingEntriesFromFiring() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val team = !createTestMatchTeam(eventId)

        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.MASS, null, listOf(team)),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id
        !TimingSequenceService.startSequence(sequenceId, userId, eventId)
        !shiftStart(sequenceId, System.currentTimeMillis() - 100)
        !TimingSequenceService.abortSequence(sequenceId, userId, eventId)

        assertEquals(0, (!TimingSequenceService.fireDueEntries()).fired.size)

        val aborted = !TimingSequenceRepo.get(sequenceId).orDie()
        assertEquals(SequenceState.ABORTED.name, aborted!!.state)
        // A station whose sequence was aborted is free again.
        assertKIOSucceeds {
            TimingSequenceService.createSequence(
                CreateSequenceRequest(stationId, SequenceMode.MASS, null, listOf(team)),
                userId,
                eventId,
            )
        }
    }

    @Test
    fun abortingTwiceConflicts() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val team = !createTestMatchTeam(eventId)

        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.MASS, null, listOf(team)),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id
        !TimingSequenceService.abortSequence(sequenceId, userId, eventId)

        assertKIOFails(TimingError.SequenceStateConflict) {
            TimingSequenceService.abortSequence(sequenceId, userId, eventId)
        }
    }

    @Test
    fun skippingAnAlreadyStartedEntryConflicts() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val teamA = !createTestMatchTeam(eventId)
        val teamB = !createTestMatchTeam(eventId)

        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.INTERVAL, 1000, listOf(teamA, teamB)),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id
        !TimingSequenceService.startSequence(sequenceId, userId, eventId)
        !shiftStart(sequenceId, System.currentTimeMillis() - 500)
        val fired = (!TimingSequenceService.fireDueEntries()).fired.single()

        assertKIOFails(TimingError.SequenceStateConflict) {
            TimingSequenceService.skipEntry(fired.entryId, userId, eventId)
        }
    }

    @Test
    fun operationsOnForeignEventFail() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val (otherEventId, _) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val team = !createTestMatchTeam(eventId)

        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.MASS, null, listOf(team)),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id

        assertKIOFails(TimingError.EventMismatch) {
            TimingSequenceService.startSequence(sequenceId, userId, otherEventId)
        }
    }

    @Test
    fun unknownSequenceFails() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()

        assertKIOFails(TimingError.SequenceNotFound) {
            TimingSequenceService.startSequence(java.util.UUID.randomUUID(), userId, eventId)
        }
    }

    @Test
    fun secondDirectInsertForSameStationIsRejectedByUniqueIndex() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val now = LocalDateTime.now()

        fun armedRecord() = TimingStartSequenceRecord(
            id = java.util.UUID.randomUUID(),
            event = eventId,
            station = stationId,
            mode = SequenceMode.MASS.name,
            intervalMillis = null,
            state = SequenceState.ARMED.name,
            startedAtMillis = null,
            createdAt = now,
            createdBy = userId,
            updatedAt = now,
            updatedBy = userId,
        )

        // Goes straight through the repo, bypassing TimingSequenceService's existsActiveForStation
        // pre-check entirely - this is what exercises the uq_timing_sequence_active_station
        // partial unique index (and TimingSequenceRepo.create's onConflict handling) rather than
        // the pre-check's ordinary 409 path.
        val first = !TimingSequenceRepo.create(armedRecord()).orDie()
        assertNotNull(first)

        val second = !TimingSequenceRepo.create(armedRecord()).orDie()
        assertNull(second)
    }

    @Test
    fun getActiveSequenceFallsBackToRecentlyFinishedSequence() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val team = !createTestMatchTeam(eventId)

        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.MASS, null, listOf(team)),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id
        !TimingSequenceService.abortSequence(sequenceId, userId, eventId)

        // No active sequence anymore, but it only just finished - a client that missed the
        // terminal broadcast must still be able to render its outcome.
        val response = !TimingSequenceService.getActiveSequence(eventId, stationId)
        val dto = ((response as ApiResponse.Dto<ActiveSequenceDto>).dto).sequence

        assertNotNull(dto)
        assertEquals(sequenceId, dto.id)
        assertEquals(SequenceState.ABORTED, dto.state)
    }

    @Test
    fun getActiveSequenceIgnoresStaleFinishedSequence() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val team = !createTestMatchTeam(eventId)

        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.MASS, null, listOf(team)),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id
        !TimingSequenceService.abortSequence(sequenceId, userId, eventId)

        // Well past the 10 minute window - old news, so the board should fall back to its normal
        // "no active sequence" state rather than resurfacing ancient history.
        !TimingSequenceRepo.update(sequenceId) {
            updatedAt = LocalDateTime.now().minusMinutes(11)
        }.orDie()

        val response = !TimingSequenceService.getActiveSequence(eventId, stationId)
        assertNull(((response as ApiResponse.Dto<ActiveSequenceDto>).dto).sequence)
    }

    @Test
    fun skippingLastPendingEntryAbortsArmedSequence() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val teamA = !createTestMatchTeam(eventId)
        val teamB = !createTestMatchTeam(eventId)

        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.MASS, null, listOf(teamA, teamB)),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id
        val entries = (!TimingSequenceEntryRepo.getBySequence(sequenceId).orDie()).sortedBy { it.position }

        !TimingSequenceService.skipEntry(entries[0].id, userId, eventId)
        // One PENDING entry is still left, so the sequence must stay ARMED.
        val stillArmed = !TimingSequenceRepo.get(sequenceId).orDie()
        assertEquals(SequenceState.ARMED.name, stillArmed!!.state)

        !TimingSequenceService.skipEntry(entries[1].id, userId, eventId)
        // Nothing pending left and it never started - the scheduler will never touch this
        // sequence, so skipEntry itself must resolve it instead of leaving it stuck ARMED.
        val aborted = !TimingSequenceRepo.get(sequenceId).orDie()
        assertEquals(SequenceState.ABORTED.name, aborted!!.state)

        // The station is free again, same as after an operator-triggered abort.
        assertKIOSucceeds {
            TimingSequenceService.createSequence(
                CreateSequenceRequest(stationId, SequenceMode.MASS, null, listOf(teamA)),
                userId,
                eventId,
            )
        }
    }

    // The scheduler owns the wall clock, so tests move the sequence's start instant instead of
    // sleeping: shifting startedAtMillis into the past makes exactly the intended slots due.
    private fun shiftStart(sequenceId: java.util.UUID, startedAt: Long) =
        TimingSequenceRepo.update(sequenceId) { startedAtMillis = startedAt }.orDie()
}
