package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.eventInfo.boundary.EventChangeMarker
import de.lambda9.ready2race.backend.app.timing.boundary.TimingOfficialTimeService
import de.lambda9.ready2race.backend.app.timing.boundary.TimingSequenceService
import de.lambda9.ready2race.backend.app.timing.control.TimingAssignmentRepo
import de.lambda9.ready2race.backend.app.timing.control.TimingOfficialTimeRepo
import de.lambda9.ready2race.backend.app.timing.control.TimingSequenceEntryRepo
import de.lambda9.ready2race.backend.app.timing.control.TimingSequenceRepo
import de.lambda9.ready2race.backend.app.timing.control.TimingTimeMarkRepo
import de.lambda9.ready2race.backend.app.timing.entity.ActiveSequenceDto
import de.lambda9.ready2race.backend.app.timing.entity.CreateSequenceRequest
import de.lambda9.ready2race.backend.app.timing.entity.OfficialTimeOverrideRequest
import de.lambda9.ready2race.backend.app.timing.entity.SequenceEntryStatus
import de.lambda9.ready2race.backend.app.timing.entity.SequenceMode
import de.lambda9.ready2race.backend.app.timing.entity.SequenceState
import de.lambda9.ready2race.backend.app.timing.entity.TimingError
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationType
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingStartSequenceRecord
import de.lambda9.ready2race.backend.validation.ValidationResult
import de.lambda9.ready2race.testing.testComprehension
import de.lambda9.tailwind.core.extensions.kio.orDie
import de.lambda9.tailwind.jooq.Jooq
import java.time.LocalDateTime
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class TimingSequenceServiceTest {

    // Used throughout the firing-timing tests below to keep the due-time arithmetic simple and
    // independent from the lead-in *default* rules, which get their own dedicated tests.
    private val LEAD_IN = 3000L

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
        // No lead-in was given, so INTERVAL defaults it to one full cadence.
        assertEquals(60000L, dto.leadInMillis)
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
            CreateSequenceRequest(stationId, SequenceMode.INTERVAL, 1000, listOf(teamA, teamB), LEAD_IN),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id
        !TimingSequenceService.startSequence(sequenceId, userId, eventId)

        // Position 0 (which fires at startedAt + LEAD_IN) is 500ms overdue, position 1 (one
        // interval later) is still 500ms away.
        val firstStart = System.currentTimeMillis() - 500 - LEAD_IN
        !shiftStart(sequenceId, firstStart)

        val firstRun = !TimingSequenceService.fireDueEntries()
        assertEquals(1, firstRun.fired.size)
        assertEquals(teamA, firstRun.fired.single().mark.assignedTeam)
        assertEquals(firstStart + LEAD_IN, firstRun.fired.single().mark.timestampMillis)

        val afterFirst = !TimingSequenceEntryRepo.getBySequence(sequenceId).orDie()
        assertEquals(
            listOf(SequenceEntryStatus.STARTED.name, SequenceEntryStatus.PENDING.name),
            afterFirst.sortedBy { it.position }.map { it.status },
        )
        val stillRunning = !TimingSequenceRepo.get(sequenceId).orDie()
        assertEquals(SequenceState.RUNNING.name, stillRunning!!.state)

        // Now position 1 is due as well.
        val secondStart = System.currentTimeMillis() - 1500 - LEAD_IN
        !shiftStart(sequenceId, secondStart)

        val secondRun = !TimingSequenceService.fireDueEntries()
        assertEquals(1, secondRun.fired.size)
        assertEquals(teamB, secondRun.fired.single().mark.assignedTeam)
        assertEquals(secondStart + LEAD_IN + 1000, secondRun.fired.single().mark.timestampMillis)

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
            CreateSequenceRequest(stationId, SequenceMode.MASS, null, listOf(team), LEAD_IN),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id
        !TimingSequenceService.startSequence(sequenceId, userId, eventId)
        val startedAt = System.currentTimeMillis() - 100 - LEAD_IN
        !shiftStart(sequenceId, startedAt)

        val result = !TimingSequenceService.fireDueEntries()
        val fired = result.fired.single()

        val mark = !TimingTimeMarkRepo.get(fired.mark.id).orDie()
        assertNotNull(mark)
        assertEquals(stationId, mark.station)
        assertEquals(eventId, mark.event)
        // The mark carries the planned instant, i.e. startedAt plus the lead-in - not the raw
        // start instant itself.
        assertEquals(startedAt + LEAD_IN, mark.timestampMillis)
        assertEquals("ACTIVE", mark.status)

        val assignment = !TimingAssignmentRepo.getByTimeMark(mark.id).orDie()
        assertNotNull(assignment)
        assertEquals(team, assignment.competitionMatchTeam)

        val entry = !TimingSequenceEntryRepo.get(fired.entryId).orDie()
        assertEquals(mark.id, entry!!.timeMark)
    }

    // fireEntry inserts the mark/assignment/entry-status update via repos directly (it runs from the
    // scheduler, not through TimingService), so it is easy to forget the Echtzeit-Übernahme every
    // other timing mutation goes through - the fired mark can change what a team's official time
    // computes to, and the row has to stay in sync instead of silently drifting.
    @Test
    fun firingEntryKeepsTheOfficialTimeInSync() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val team = !createTestMatchTeam(eventId)
        !TimingOfficialTimeService.setOverride(
            eventId,
            team,
            OfficialTimeOverrideRequest(overrideMillis = 60_000, penaltyMillis = null, resultStatus = null),
            userId,
        )
        assertFalse((!TimingOfficialTimeRepo.getByTeam(team))!!.dirty!!)

        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.MASS, null, listOf(team), LEAD_IN),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id
        !TimingSequenceService.startSequence(sequenceId, userId, eventId)
        !shiftStart(sequenceId, System.currentTimeMillis() - 100 - LEAD_IN)

        assertEquals(1, (!TimingSequenceService.fireDueEntries()).fired.size)

        // Die Startmarke allein ergibt keine berechnete Zeit; der Override von 60 s gilt weiter und
        // ist bereits geschrieben - nichts driftet, nichts wird "dirty".
        val official = !TimingOfficialTimeRepo.getByTeam(team)
        assertFalse(official!!.dirty!!)
        assertNull(official.computedMillis)
        assertEquals(60_000L, official.overrideMillis)
    }

    @Test
    fun massSequenceFiresEveryEntryAtOnce() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val teamA = !createTestMatchTeam(eventId)
        val teamB = !createTestMatchTeam(eventId)

        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.MASS, null, listOf(teamA, teamB), LEAD_IN),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id
        !TimingSequenceService.startSequence(sequenceId, userId, eventId)
        val startedAt = System.currentTimeMillis() - 100 - LEAD_IN
        !shiftStart(sequenceId, startedAt)

        val result = !TimingSequenceService.fireDueEntries()

        assertEquals(2, result.fired.size)
        // One signal starts all, once the lead-in has elapsed: identical timestamps.
        assertEquals(setOf(startedAt + LEAD_IN), result.fired.map { it.mark.timestampMillis }.toSet())
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
            CreateSequenceRequest(stationId, SequenceMode.INTERVAL, 1000, listOf(teamA, teamB), LEAD_IN),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id
        val entries = (!TimingSequenceEntryRepo.getBySequence(sequenceId).orDie()).sortedBy { it.position }
        !TimingSequenceService.skipEntry(entries.first().id, userId, eventId)
        !TimingSequenceService.startSequence(sequenceId, userId, eventId)

        // The skipped slot at position 0 has passed - position 1 must NOT move up into it.
        val firstStart = System.currentTimeMillis() - 500 - LEAD_IN
        !shiftStart(sequenceId, firstStart)
        val firstRun = !TimingSequenceService.fireDueEntries()
        assertEquals(0, firstRun.fired.size)

        val secondStart = System.currentTimeMillis() - 1500 - LEAD_IN
        !shiftStart(sequenceId, secondStart)
        val secondRun = !TimingSequenceService.fireDueEntries()

        assertEquals(1, secondRun.fired.size)
        assertEquals(teamB, secondRun.fired.single().mark.assignedTeam)
        assertEquals(secondStart + LEAD_IN + 1000, secondRun.fired.single().mark.timestampMillis)

        val sequence = secondRun.changedSequences.single()
        assertEquals(SequenceState.DONE, sequence.state)
        assertEquals(SequenceEntryStatus.SKIPPED, sequence.entries.first().status)
        assertEquals(secondStart + LEAD_IN, sequence.entries.first().plannedStartMillis)
        assertEquals(secondStart + LEAD_IN + 1000, sequence.entries[1].plannedStartMillis)
    }

    @Test
    fun rerunningFireIsIdempotent() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val team = !createTestMatchTeam(eventId)

        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.MASS, null, listOf(team), LEAD_IN),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id
        !TimingSequenceService.startSequence(sequenceId, userId, eventId)
        !shiftStart(sequenceId, System.currentTimeMillis() - 100 - LEAD_IN)

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
            CreateSequenceRequest(stationId, SequenceMode.INTERVAL, 1000, listOf(teamA, teamB), LEAD_IN),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id
        !TimingSequenceService.startSequence(sequenceId, userId, eventId)
        !shiftStart(sequenceId, System.currentTimeMillis() - 500 - LEAD_IN)
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
            leadInMillis = CreateSequenceRequest.DEFAULT_MASS_LEAD_IN_MILLIS,
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

    @Test
    fun massSequenceDefaultsLeadInToTenSeconds() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val team = !createTestMatchTeam(eventId)

        !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.MASS, null, listOf(team)),
            userId,
            eventId,
        )

        val response = !TimingSequenceService.getActiveSequence(eventId, stationId)
        val dto = ((response as ApiResponse.Dto<ActiveSequenceDto>).dto).sequence
        assertEquals(10000L, dto!!.leadInMillis)
    }

    @Test
    fun intervalSequenceDefaultsLeadInToItsCadence() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val team = !createTestMatchTeam(eventId)

        !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.INTERVAL, 45000, listOf(team)),
            userId,
            eventId,
        )

        val response = !TimingSequenceService.getActiveSequence(eventId, stationId)
        val dto = ((response as ApiResponse.Dto<ActiveSequenceDto>).dto).sequence
        assertEquals(45000L, dto!!.leadInMillis)
    }

    @Test
    fun explicitLeadInOverridesTheDefaultAndOffsetsPlannedStarts() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val teamA = !createTestMatchTeam(eventId)
        val teamB = !createTestMatchTeam(eventId)

        // A custom lead-in distinct from both the interval and the MASS default, so a bug that
        // fell back to either default instead of honoring the request would fail this test.
        val customLeadIn = 15000L
        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.INTERVAL, 1000, listOf(teamA, teamB), customLeadIn),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id
        !TimingSequenceService.startSequence(sequenceId, userId, eventId)
        val startedAt = System.currentTimeMillis()
        !shiftStart(sequenceId, startedAt)

        val response = !TimingSequenceService.getActiveSequence(eventId, stationId)
        val dto = ((response as ApiResponse.Dto<ActiveSequenceDto>).dto).sequence!!

        assertEquals(customLeadIn, dto.leadInMillis)
        val entries = dto.entries.sortedBy { it.position }
        assertEquals(startedAt + customLeadIn, entries[0].plannedStartMillis)
        assertEquals(startedAt + customLeadIn + 1000, entries[1].plannedStartMillis)
    }

    @Test
    fun leadInBelowMinimumFailsValidation() {
        val request = CreateSequenceRequest(
            station = java.util.UUID.randomUUID(),
            mode = SequenceMode.MASS,
            intervalMillis = null,
            teams = listOf(java.util.UUID.randomUUID()),
            leadInMillis = CreateSequenceRequest.MIN_LEAD_IN_MILLIS - 1,
        )
        assertIs<ValidationResult.Invalid>(request.validate())
    }

    @Test
    fun leadInAboveMaximumFailsValidation() {
        val request = CreateSequenceRequest(
            station = java.util.UUID.randomUUID(),
            mode = SequenceMode.MASS,
            intervalMillis = null,
            teams = listOf(java.util.UUID.randomUUID()),
            leadInMillis = CreateSequenceRequest.MAX_LEAD_IN_MILLIS + 1,
        )
        assertIs<ValidationResult.Invalid>(request.validate())
    }

    @Test
    fun leadInAtTheBoundsPassesValidation() {
        val team = java.util.UUID.randomUUID()
        val lower = CreateSequenceRequest(
            station = java.util.UUID.randomUUID(),
            mode = SequenceMode.MASS,
            intervalMillis = null,
            teams = listOf(team),
            leadInMillis = CreateSequenceRequest.MIN_LEAD_IN_MILLIS,
        )
        val upper = lower.copy(leadInMillis = CreateSequenceRequest.MAX_LEAD_IN_MILLIS)
        val absent = lower.copy(leadInMillis = null)

        assertEquals(ValidationResult.Valid, lower.validate())
        assertEquals(ValidationResult.Valid, upper.validate())
        assertEquals(ValidationResult.Valid, absent.validate())
    }

    @Test
    fun derivedLeadInIsClampedToMinimumBounds() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val teamA = !createTestMatchTeam(eventId)
        val teamB = !createTestMatchTeam(eventId)

        // INTERVAL with intervalMillis=1000 (below MIN_LEAD_IN_MILLIS=3000)
        // Without explicit leadInMillis, the derived default should clamp to 3000
        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.INTERVAL, 1000, listOf(teamA, teamB)),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id
        !TimingSequenceService.startSequence(sequenceId, userId, eventId)
        val startedAt = System.currentTimeMillis()
        !shiftStart(sequenceId, startedAt)

        val response = !TimingSequenceService.getActiveSequence(eventId, stationId)
        val dto = ((response as ApiResponse.Dto<ActiveSequenceDto>).dto).sequence!!

        // Derived lead-in should be clamped to minimum (3000), not 1000
        assertEquals(3000L, dto.leadInMillis)
        val entries = dto.entries.sortedBy { it.position }
        assertEquals(startedAt + 3000, entries[0].plannedStartMillis)
        assertEquals(startedAt + 3000 + 1000, entries[1].plannedStartMillis)
    }

    // --- Anhalten, Zurücksetzen, Fortsetzen -----------------------------------------------------

    @Test
    fun pausedSequenceFiresNothing() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val teamA = !createTestMatchTeam(eventId)
        val teamB = !createTestMatchTeam(eventId)

        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.INTERVAL, 1000, listOf(teamA, teamB), LEAD_IN),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id
        !TimingSequenceService.startSequence(sequenceId, userId, eventId)
        // Position 0 ist 500 ms überfällig - ohne Pause würde sie im nächsten Tick feuern.
        !shiftStart(sequenceId, System.currentTimeMillis() - 500 - LEAD_IN)

        !TimingSequenceService.pauseSequence(sequenceId, userId, eventId)
        val paused = !TimingSequenceRepo.get(sequenceId).orDie()
        assertEquals(SequenceState.PAUSED.name, paused!!.state)
        assertNotNull(paused.pausedAtMillis)

        // Der Kern der Pause: der Scheduler lässt eine angehaltene Sequenz vollständig in Ruhe.
        assertEquals(0, (!TimingSequenceService.fireDueEntries()).fired.size)
        assertTrue(
            (!TimingSequenceEntryRepo.getBySequence(sequenceId).orDie())
                .all { it.status == SequenceEntryStatus.PENDING.name }
        )

        // Und sie ist keine Sackgasse: fortgesetzt feuert der überfällige Eintrag sofort.
        !TimingSequenceService.resumeSequence(sequenceId, userId, eventId)
        assertEquals(1, (!TimingSequenceService.fireDueEntries()).fired.size)
    }

    @Test
    fun resumeShiftsPlannedStartsByThePauseDuration() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val teamA = !createTestMatchTeam(eventId)
        val teamB = !createTestMatchTeam(eventId)

        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.INTERVAL, 60000, listOf(teamA, teamB), LEAD_IN),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id
        !TimingSequenceService.startSequence(sequenceId, userId, eventId)
        val startedAt = System.currentTimeMillis()
        !shiftStart(sequenceId, startedAt)

        val plannedBefore = !plannedStartsOf(sequenceId, eventId, stationId)
        assertEquals(listOf(startedAt + LEAD_IN, startedAt + LEAD_IN + 60000), plannedBefore)

        !TimingSequenceService.pauseSequence(sequenceId, userId, eventId)
        // Statt zu schlafen: den Pausenbeginn um 30 s nach hinten datieren - das Fortsetzen
        // rechnet dann mit einer 30-Sekunden-Pause, wie sie am Wasser realistisch ist.
        val pauseMillis = 30000L
        !backdatePause(sequenceId, pauseMillis)
        !TimingSequenceService.resumeSequence(sequenceId, userId, eventId)

        val resumed = !TimingSequenceRepo.get(sequenceId).orDie()
        assertEquals(SequenceState.RUNNING.name, resumed!!.state)
        // Die laufende Pause ist vorbei und darf nicht ein zweites Mal verrechnet werden.
        assertNull(resumed.pausedAtMillis)
        val shift = resumed.pauseShiftMillis!!
        // Der Testlauf selbst braucht ein paar Millisekunden - deshalb ein Fenster statt eines
        // exakten Werts; entscheidend ist, dass die datierte Pause auch wirklich drinsteckt.
        assertTrue(shift >= pauseMillis, "Verschiebung $shift ist kleiner als die Pause $pauseMillis")
        assertTrue(shift < pauseMillis + 10000, "Verschiebung $shift ist unplausibel groß")

        // Die Kette wandert als GANZES: beide Positionen um exakt dieselbe Verschiebung, der
        // Abstand zwischen den Booten bleibt damit die eingestellte Minute.
        val plannedAfter = !plannedStartsOf(sequenceId, eventId, stationId)
        assertEquals(plannedBefore.map { it + shift }, plannedAfter)
        assertEquals(60000L, plannedAfter[1] - plannedAfter[0])
        // Der tatsächliche Startzeitpunkt bleibt unangetastet - die Pause rechnet sich nicht in
        // ihn hinein, sondern steht als eigener Wert daneben.
        assertEquals(startedAt, resumed.startedAtMillis)
    }

    @Test
    fun repeatedPausesAccumulateTheirShift() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val team = !createTestMatchTeam(eventId)

        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.INTERVAL, 60000, listOf(team), LEAD_IN),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id
        !TimingSequenceService.startSequence(sequenceId, userId, eventId)
        !shiftStart(sequenceId, System.currentTimeMillis() + 600000)

        !TimingSequenceService.pauseSequence(sequenceId, userId, eventId)
        !backdatePause(sequenceId, 10000L)
        !TimingSequenceService.resumeSequence(sequenceId, userId, eventId)
        !TimingSequenceService.pauseSequence(sequenceId, userId, eventId)
        !backdatePause(sequenceId, 20000L)
        !TimingSequenceService.resumeSequence(sequenceId, userId, eventId)

        // Zweimal angehalten heißt zweimal verschoben - die zweite Pause darf die erste nicht
        // überschreiben, sonst verlöre die Kette den bereits gewährten Aufschub wieder.
        val shift = (!TimingSequenceRepo.get(sequenceId).orDie())!!.pauseShiftMillis!!
        assertTrue(shift >= 30000L, "Verschiebung $shift enthält nicht beide Pausen")
        assertTrue(shift < 40000L, "Verschiebung $shift ist unplausibel groß")
    }

    @Test
    fun rewindMakesTheLastStartedEntryPendingAgain() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val teamA = !createTestMatchTeam(eventId)
        val teamB = !createTestMatchTeam(eventId)

        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.INTERVAL, 60000, listOf(teamA, teamB), LEAD_IN),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id
        !TimingSequenceService.startSequence(sequenceId, userId, eventId)
        // Nur Position 0 wird fällig - Position 1 liegt eine volle Minute später.
        !shiftStart(sequenceId, System.currentTimeMillis() - 500 - LEAD_IN)
        val fired = (!TimingSequenceService.fireDueEntries()).fired.single()

        !TimingSequenceService.pauseSequence(sequenceId, userId, eventId)
        !TimingSequenceService.rewindSequence(sequenceId, userId, eventId)

        // Der Eintrag steht wieder an: kein Status STARTED, keine Marke mehr an ihm.
        val entry = !TimingSequenceEntryRepo.get(fired.entryId).orDie()
        assertEquals(SequenceEntryStatus.PENDING.name, entry!!.status)
        assertNull(entry.timeMark)

        // Und die Startmarke ist über die vorhandene Rücknahme zurückgegangen - nicht gelöscht,
        // sondern RETRACTED, damit sie im Leitstand nachvollziehbar bleibt.
        val mark = !TimingTimeMarkRepo.get(fired.mark.id).orDie()
        assertEquals("RETRACTED", mark!!.status)

        // Fortgesetzt startet das Boot erneut: sein Slot ist längst vorbei, also feuert es sofort
        // und bekommt eine frische Marke.
        !TimingSequenceService.resumeSequence(sequenceId, userId, eventId)
        val again = (!TimingSequenceService.fireDueEntries()).fired.single()
        assertEquals(teamA, again.mark.assignedTeam)
        assertTrue(again.mark.id != fired.mark.id)
    }

    @Test
    fun rewindTakesTheLastStartedEntryNotTheFirst() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val teamA = !createTestMatchTeam(eventId)
        val teamB = !createTestMatchTeam(eventId)
        val teamC = !createTestMatchTeam(eventId)

        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.INTERVAL, 1000, listOf(teamA, teamB, teamC), LEAD_IN),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id
        !TimingSequenceService.startSequence(sequenceId, userId, eventId)
        // Positionen 0 und 1 sind fällig, Position 2 noch nicht.
        !shiftStart(sequenceId, System.currentTimeMillis() - 1500 - LEAD_IN)
        assertEquals(2, (!TimingSequenceService.fireDueEntries()).fired.size)

        !TimingSequenceService.pauseSequence(sequenceId, userId, eventId)
        !TimingSequenceService.rewindSequence(sequenceId, userId, eventId)

        // Genau EIN Schritt zurück: Position 1 steht wieder an, Position 0 bleibt gestartet.
        val entries = (!TimingSequenceEntryRepo.getBySequence(sequenceId).orDie()).sortedBy { it.position }
        assertEquals(
            listOf(
                SequenceEntryStatus.STARTED.name,
                SequenceEntryStatus.PENDING.name,
                SequenceEntryStatus.PENDING.name,
            ),
            entries.map { it.status },
        )
        assertNotNull(entries[0].timeMark)
    }

    @Test
    fun pausingIsOnlyPossibleWhileRunning() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val team = !createTestMatchTeam(eventId)

        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.MASS, null, listOf(team)),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id

        // Scharfgestellt, aber nicht gestartet - es läuft nichts, was man anhalten könnte.
        assertKIOFails(TimingError.SequenceStateConflict) {
            TimingSequenceService.pauseSequence(sequenceId, userId, eventId)
        }

        !TimingSequenceService.startSequence(sequenceId, userId, eventId)
        !TimingSequenceService.pauseSequence(sequenceId, userId, eventId)
        // Zweimal anhalten würde den Pausenbeginn überschreiben und damit den bereits gewährten
        // Aufschub verschlucken.
        assertKIOFails(TimingError.SequenceStateConflict) {
            TimingSequenceService.pauseSequence(sequenceId, userId, eventId)
        }

        !TimingSequenceService.abortSequence(sequenceId, userId, eventId)
        assertKIOFails(TimingError.SequenceStateConflict) {
            TimingSequenceService.pauseSequence(sequenceId, userId, eventId)
        }
    }

    @Test
    fun resumingAndRewindingAreOnlyPossibleWhilePaused() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val team = !createTestMatchTeam(eventId)

        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.INTERVAL, 60000, listOf(team), LEAD_IN),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id

        // ARMED: weder fortzusetzen noch zurückzusetzen.
        assertKIOFails(TimingError.SequenceStateConflict) {
            TimingSequenceService.resumeSequence(sequenceId, userId, eventId)
        }
        assertKIOFails(TimingError.SequenceStateConflict) {
            TimingSequenceService.rewindSequence(sequenceId, userId, eventId)
        }

        !TimingSequenceService.startSequence(sequenceId, userId, eventId)
        // RUNNING: das Zurücksetzen mitten im laufenden Countdown wäre ein Wettlauf mit dem
        // Scheduler - erst anhalten.
        assertKIOFails(TimingError.SequenceStateConflict) {
            TimingSequenceService.resumeSequence(sequenceId, userId, eventId)
        }
        assertKIOFails(TimingError.SequenceStateConflict) {
            TimingSequenceService.rewindSequence(sequenceId, userId, eventId)
        }
    }

    @Test
    fun rewindingWithoutAnyStartedEntryConflicts() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val team = !createTestMatchTeam(eventId)

        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.INTERVAL, 60000, listOf(team), LEAD_IN),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id
        !TimingSequenceService.startSequence(sequenceId, userId, eventId)
        !TimingSequenceService.pauseSequence(sequenceId, userId, eventId)

        // Angehalten noch im Vorlauf: es gibt keinen Start, den man zurücknehmen könnte.
        assertKIOFails(TimingError.SequenceStateConflict) {
            TimingSequenceService.rewindSequence(sequenceId, userId, eventId)
        }
    }

    @Test
    fun pausedSequenceKeepsHoldingItsStation() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val team = !createTestMatchTeam(eventId)
        val request = CreateSequenceRequest(stationId, SequenceMode.INTERVAL, 60000, listOf(team), LEAD_IN)

        val created = !TimingSequenceService.createSequence(request, userId, eventId)
        val sequenceId = (created as ApiResponse.Created).id
        !TimingSequenceService.startSequence(sequenceId, userId, eventId)
        !TimingSequenceService.pauseSequence(sequenceId, userId, eventId)

        // Die Pause ist eine Unterbrechung, kein Ende: der Posten bleibt belegt (sonst feuerten
        // nach dem Fortsetzen zwei Sequenzen auf dieselbe Startlinie) ...
        assertKIOFails(TimingError.SequenceAlreadyActive) {
            TimingSequenceService.createSequence(request, userId, eventId)
        }

        // ... und die Boards sehen sie weiterhin als die aktive Sequenz ihres Postens.
        val response = !TimingSequenceService.getActiveSequence(eventId, stationId)
        val dto = ((response as ApiResponse.Dto<ActiveSequenceDto>).dto).sequence
        assertNotNull(dto)
        assertEquals(sequenceId, dto.id)
        assertEquals(SequenceState.PAUSED, dto.state)
        assertNotNull(dto.pausedAtMillis)
    }

    // ------------------------------------------------- Überspringen: volle Zeit fürs nächste Boot

    /**
     * Wird der NÄCHSTE anstehende Start übersprungen (der Fall am Wasser: der fällige oder schon
     * überfällige Start kann nicht raus), bekommt das nachfolgende Boot wieder den vollen
     * Startabstand ab JETZT - statt eines Restcountdowns von Sekunden. Die Kette rückt dafür als
     * Ganzes über `pause_shift_millis`, die Abstände der weiteren Boote bleiben unverändert.
     */
    @Test
    fun skippingTheOverdueNextEntryGivesTheFollowingBoatAFullInterval() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val teams = !createTestMatchTeams(eventId, 3)

        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.INTERVAL, 60000, teams, LEAD_IN),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id
        !TimingSequenceService.startSequence(sequenceId, userId, eventId)
        // Position 0 ist 500 ms überfällig, Position 1 stünde in ~59,5 s an.
        !shiftStart(sequenceId, System.currentTimeMillis() - 500 - LEAD_IN)

        val entries = (!TimingSequenceEntryRepo.getBySequence(sequenceId).orDie())
            .sortedBy { it.position }
        val before = System.currentTimeMillis()
        !TimingSequenceService.skipEntry(entries[0].id, userId, eventId)

        val planned = !plannedStartsOf(sequenceId, eventId, stationId)
        // Das nächste Boot (Position 1) hat wieder mindestens den vollen Abstand ab jetzt...
        assertTrue(
            planned[1] >= before + 60000,
            "nächster Start ${planned[1] - before} ms nach dem Skip ist kein voller Abstand",
        )
        assertTrue(planned[1] < before + 70000, "Verschiebung ${planned[1] - before} ist unplausibel groß")
        // ... und die Kette dahinter behält ihren Abstand.
        assertEquals(60000L, planned[2] - planned[1])
    }

    @Test
    fun skippingALaterEntryLeavesThePlanAlone() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val teams = !createTestMatchTeams(eventId, 3)

        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.INTERVAL, 60000, teams, LEAD_IN),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id
        !TimingSequenceService.startSequence(sequenceId, userId, eventId)
        !shiftStart(sequenceId, System.currentTimeMillis() - 500 - LEAD_IN)

        val entries = (!TimingSequenceEntryRepo.getBySequence(sequenceId).orDie())
            .sortedBy { it.position }
        val plannedBefore = !plannedStartsOf(sequenceId, eventId, stationId)
        // Position 2 wird gestrichen - der unmittelbar bevorstehende Start (Position 0) und der
        // Rest des Plans gehen das nichts an.
        !TimingSequenceService.skipEntry(entries[2].id, userId, eventId)

        assertEquals(plannedBefore, !plannedStartsOf(sequenceId, eventId, stationId))
    }

    @Test
    fun skippingLongBeforeTheSlotDoesNotPullOrPushTheChain() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val teams = !createTestMatchTeams(eventId, 2)

        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.INTERVAL, 60000, teams, LEAD_IN),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id
        !TimingSequenceService.startSequence(sequenceId, userId, eventId)
        // Die ganze Kette liegt weit in der Zukunft - das nächste Boot hat schon MEHR als den
        // vollen Abstand, die Verschiebung darf es weder vorziehen noch weiter wegschieben.
        !shiftStart(sequenceId, System.currentTimeMillis() + 600000)

        val entries = (!TimingSequenceEntryRepo.getBySequence(sequenceId).orDie())
            .sortedBy { it.position }
        val plannedBefore = !plannedStartsOf(sequenceId, eventId, stationId)
        !TimingSequenceService.skipEntry(entries[0].id, userId, eventId)

        assertEquals(plannedBefore, !plannedStartsOf(sequenceId, eventId, stationId))
    }

    /**
     * Skip aus der PAUSE heraus: Referenz ist der Pausenbeginn, nicht "jetzt" - zusammen mit der
     * Verschiebung des Fortsetzens landet der nächste Start exakt einen vollen Abstand nach dem
     * Fortsetzen, egal wie lange die Pause dauert.
     */
    @Test
    fun skippingWhilePausedGivesAFullIntervalAfterResume() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val teams = !createTestMatchTeams(eventId, 2)

        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.INTERVAL, 60000, teams, LEAD_IN),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id
        !TimingSequenceService.startSequence(sequenceId, userId, eventId)

        !TimingSequenceService.pauseSequence(sequenceId, userId, eventId)
        // Eine echte halbe Minute Pause, ohne zu schlafen (siehe backdatePause) - und der
        // Startmoment so datiert, dass Position 0 BEIM Pausenbeginn 500 ms überfällig war:
        // genau die Lage, in der am Wasser angehalten und übersprungen wird.
        !backdatePause(sequenceId, 30000L)
        !shiftStart(sequenceId, System.currentTimeMillis() - 30500 - LEAD_IN)

        val entries = (!TimingSequenceEntryRepo.getBySequence(sequenceId).orDie())
            .sortedBy { it.position }
        !TimingSequenceService.skipEntry(entries[0].id, userId, eventId)

        val beforeResume = System.currentTimeMillis()
        !TimingSequenceService.resumeSequence(sequenceId, userId, eventId)

        val planned = !plannedStartsOf(sequenceId, eventId, stationId)
        assertTrue(
            planned[1] >= beforeResume + 60000,
            "nächster Start ${planned[1] - beforeResume} ms nach dem Fortsetzen ist kein voller Abstand",
        )
        assertTrue(
            planned[1] < beforeResume + 70000,
            "Verschiebung ${planned[1] - beforeResume} ist unplausibel groß",
        )
    }

    // ------------------------------------------------------- Sync mit Stream und Boards (Bumps)

    /**
     * Jede Sequenz-Mutation muss den EventChangeMarker hochzählen: an ihm hängen der Board-Kanal
     * UND der Szenen-Kanal des Livestreams (StreamSceneBroadcaster über EventChangeMarker.bump),
     * und die Stream-Uhr baut sich direkt aus dem Sequenzzustand (StreamSceneLogic.sequenceTiming).
     * Vor dieser Regel liefen Pause/Fortsetzen/Abbruch komplett am Stream vorbei - der Countdown
     * tickte on air weiter, obwohl die Kette stand.
     */
    @Test
    fun everySequenceMutationBumpsTheEventChangeMarker() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val teamA = !createTestMatchTeam(eventId)
        val teamB = !createTestMatchTeam(eventId)

        var marker = EventChangeMarker.current(eventId)
        fun assertBumped(mutation: String) {
            val current = EventChangeMarker.current(eventId)
            assertTrue(current > marker, "$mutation muss den EventChangeMarker hochzählen")
            marker = current
        }

        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.INTERVAL, 60000, listOf(teamA, teamB), LEAD_IN),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id
        assertBumped("createSequence")

        // Der Regressionsfall: die Partien sind seit dem Einrichten schon aktiviert - der Start
        // der Sequenz setzt nur startedAtMillis, und genau daraus baut der Stream den Countdown.
        !TimingSequenceService.startSequence(sequenceId, userId, eventId)
        assertBumped("startSequence (ohne frische Aktivierung)")

        // Position 0 feuern, damit später etwas zum Zurücksetzen da ist.
        !shiftStart(sequenceId, System.currentTimeMillis() - LEAD_IN)
        assertEquals(1, (!TimingSequenceService.fireDueEntries()).fired.size)
        marker = EventChangeMarker.current(eventId)

        !TimingSequenceService.pauseSequence(sequenceId, userId, eventId)
        assertBumped("pauseSequence")

        !TimingSequenceService.rewindSequence(sequenceId, userId, eventId)
        assertBumped("rewindSequence")

        !TimingSequenceService.resumeSequence(sequenceId, userId, eventId)
        assertBumped("resumeSequence")

        val entries = !TimingSequenceEntryRepo.getBySequence(sequenceId).orDie()
        val pendingEntry = entries.first { it.status == SequenceEntryStatus.PENDING.name }
        !TimingSequenceService.skipEntry(pendingEntry.id, userId, eventId)
        assertBumped("skipEntry")

        !TimingSequenceService.abortSequence(sequenceId, userId, eventId)
        assertBumped("abortSequence")
    }

    /**
     * Der DONE-Übergang OHNE Laufzustands-Stempel und ohne Ergebnis (hier: der letzte Eintrag
     * wurde übersprungen, der Scheduler löst die leere Sequenz nur noch auf) muss die Anzeigen
     * trotzdem erreichen - sonst stünde der Countdown einer längst beendeten Sequenz on air.
     */
    @Test
    fun schedulerDoneTransitionWithoutStampsStillBumps() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val team = !createTestMatchTeam(eventId)

        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.INTERVAL, 60000, listOf(team), LEAD_IN),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id
        !TimingSequenceService.startSequence(sequenceId, userId, eventId)
        val entry = (!TimingSequenceEntryRepo.getBySequence(sequenceId).orDie()).single()
        !TimingSequenceService.skipEntry(entry.id, userId, eventId)

        val marker = EventChangeMarker.current(eventId)
        val result = !TimingSequenceService.fireDueEntries()

        // Nichts gefeuert, nichts gestempelt - aber die Sequenz ist eben zu Ende gegangen.
        assertTrue(result.fired.isEmpty())
        assertEquals(
            SequenceState.DONE.name,
            (!TimingSequenceRepo.get(sequenceId).orDie())!!.state,
        )
        assertEquals(listOf(eventId), result.changedSequences.map { it.event })

        // Der Bump kommt wie immer erst nach dem Commit des Scheduler-Laufs.
        assertEquals(marker, EventChangeMarker.current(eventId))
        TimingSequenceService.broadcastFireResult(result)
        assertEquals(marker + 1, EventChangeMarker.current(eventId))
    }

    // ------------------------------------------------------------ Sperren gegen den Scheduler-Takt

    /**
     * Abbruch, Pause und Zurücksetzen laufen gegen den Scheduler, der im Sekundentakt dieselben
     * Einträge feuert. Ohne Sperre kann ein Tick zwischen dem Lesen des Zustands und dem Schreiben
     * noch einen Start setzen, den der Abbruch dann nicht mehr sieht. Deshalb nehmen diese drei
     * Mutationen als Erstes dieselbe Zeilensperre wie der Scheduler (`getPendingForUpdate`) und
     * entscheiden erst danach. Nachweis über pg_locks: `select … for update` hält ein
     * ROW SHARE-Schloss auf der Eintragstabelle bis zum Ende der Transaktion; ein gewöhnliches
     * Lesen oder Aktualisieren nimmt es nicht.
     */
    @Test
    fun abortLocksThePendingEntriesBeforeChangingTheState() = testComprehension {
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
        assertFalse(!holdsEntryRowLock(), "vor dem Abbruch darf noch keine Eintragssperre stehen")

        !TimingSequenceService.abortSequence(sequenceId, userId, eventId)

        assertTrue(!holdsEntryRowLock(), "der Abbruch muss die anstehenden Einträge sperren")
        assertEquals(SequenceState.ABORTED.name, (!TimingSequenceRepo.get(sequenceId).orDie())!!.state)
        assertTrue(
            (!TimingSequenceEntryRepo.getBySequence(sequenceId).orDie())
                .none { it.status == SequenceEntryStatus.STARTED.name }
        )
    }

    @Test
    fun pauseLocksThePendingEntriesBeforeChangingTheState() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val team = !createTestMatchTeam(eventId)

        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.INTERVAL, 60000, listOf(team), LEAD_IN),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id
        !TimingSequenceService.startSequence(sequenceId, userId, eventId)
        assertFalse(!holdsEntryRowLock())

        !TimingSequenceService.pauseSequence(sequenceId, userId, eventId)

        assertTrue(!holdsEntryRowLock(), "die Pause muss die anstehenden Einträge sperren")
        assertEquals(SequenceState.PAUSED.name, (!TimingSequenceRepo.get(sequenceId).orDie())!!.state)
    }

    @Test
    fun rewindLocksThePendingEntriesBeforeChangingThem() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val teams = !createTestMatchTeams(eventId, 2)

        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.INTERVAL, 60000, teams, LEAD_IN),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id
        !TimingSequenceService.startSequence(sequenceId, userId, eventId)
        // Direkt über die Repos in die Lage „pausiert, ein Eintrag gestartet" bringen: der
        // Scheduler und die Pause nähmen die Sperre selbst - dann wäre hier nichts mehr zu belegen.
        val entries = (!TimingSequenceEntryRepo.getBySequence(sequenceId).orDie()).sortedBy { it.position }
        val markId = !addAssignedMark(eventId, userId, stationId, teams[0], System.currentTimeMillis())
        !TimingSequenceEntryRepo.update(entries[0].id) {
            status = SequenceEntryStatus.STARTED.name
            timeMark = markId
        }.orDie()
        !TimingSequenceRepo.update(sequenceId) {
            state = SequenceState.PAUSED.name
            pausedAtMillis = System.currentTimeMillis()
        }.orDie()
        assertFalse(!holdsEntryRowLock())

        !TimingSequenceService.rewindSequence(sequenceId, userId, eventId)

        assertTrue(!holdsEntryRowLock(), "das Zurücksetzen muss die anstehenden Einträge sperren")
        assertEquals(
            SequenceEntryStatus.PENDING.name,
            (!TimingSequenceEntryRepo.get(entries[0].id).orDie())!!.status,
        )
    }

    /**
     * Der DONE-Übergang des Schedulers schreibt nur, wenn die Sequenz zwischen Lesen und Schreiben
     * nicht anderweitig beendet wurde: ein Abbruch, der in diesem Fenster landet, darf nicht von
     * einem stumpfen „state = DONE" überschrieben werden.
     */
    @Test
    fun updateStateIfLeavesASequenceInAnotherStateAlone() = testComprehension {
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
        !TimingSequenceService.abortSequence(sequenceId, userId, eventId)

        val changed = !TimingSequenceRepo.updateStateIf(sequenceId, SequenceState.RUNNING, SequenceState.DONE).orDie()

        assertEquals(0, changed)
        assertEquals(SequenceState.ABORTED.name, (!TimingSequenceRepo.get(sequenceId).orDie())!!.state)
    }

    @Test
    fun updateStateIfMovesASequenceInTheExpectedState() = testComprehension {
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

        val changed = !TimingSequenceRepo.updateStateIf(sequenceId, SequenceState.RUNNING, SequenceState.DONE).orDie()

        assertEquals(1, changed)
        assertEquals(SequenceState.DONE.name, (!TimingSequenceRepo.get(sequenceId).orDie())!!.state)
    }

    /**
     * Ob der Eintrag noch ansteht, entscheidet sich NACH der Sperre - aus den gesperrten Zeilen,
     * nicht aus dem Stand, der vor dem Warten gelesen wurde. Ein Eintrag, den ein Tick inzwischen
     * gefeuert hat, ist dann kein Kandidat mehr.
     */
    @Test
    fun skippingAStartedEntryDecidesAfterTakingTheLock() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val teams = !createTestMatchTeams(eventId, 2)

        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.INTERVAL, 60000, teams, LEAD_IN),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id
        !TimingSequenceService.startSequence(sequenceId, userId, eventId)
        val entries = (!TimingSequenceEntryRepo.getBySequence(sequenceId).orDie()).sortedBy { it.position }
        // Gestartet ohne den Scheduler (der nähme die Sperre selbst und ließe hier nichts belegen).
        !TimingSequenceEntryRepo.update(entries[0].id) { status = SequenceEntryStatus.STARTED.name }.orDie()
        assertFalse(!holdsEntryRowLock())

        assertKIOFails(TimingError.SequenceStateConflict) {
            TimingSequenceService.skipEntry(entries[0].id, userId, eventId)
        }

        assertTrue(!holdsEntryRowLock(), "die Ablehnung muss nach der Sperre fallen, nicht davor")
    }

    // Ob DIESE Transaktion die Eintragstabelle mit `for update` gesperrt hält. Das ROW SHARE-Schloss
    // steht bis zum Ende der Transaktion und ist in pg_locks sichtbar; jeder Test läuft in genau
    // einer Transaktion, deshalb muss die Sperre in jedem Fall von der geprüften Mutation stammen -
    // die Vorbereitung darf sie nicht schon genommen haben (kein fireDueEntries davor).
    private fun holdsEntryRowLock() = Jooq.query {
        val count = fetchValue(
            """
            select count(*)
            from pg_locks l
            join pg_class c on c.oid = l.relation
            where l.pid = pg_backend_pid()
              and c.relname = 'timing_start_sequence_entry'
              and l.mode = 'RowShareLock'
            """.trimIndent()
        )
        (count as Number).toLong() > 0
    }

    // Die geplanten Startzeiten so, wie die Boards sie sehen - über den Endpunkt statt über die
    // Umrechnung, damit der Test wirklich die ausgelieferte Sicht prüft.
    private fun plannedStartsOf(
        sequenceId: java.util.UUID,
        eventId: java.util.UUID,
        stationId: java.util.UUID,
    ) = TimingSequenceService.getActiveSequence(eventId, stationId).map { response ->
        val dto = ((response as ApiResponse.Dto<ActiveSequenceDto>).dto).sequence!!
        assertEquals(sequenceId, dto.id)
        dto.entries.sortedBy { it.position }.map { it.plannedStartMillis!! }
    }

    // Statt zu schlafen: den Pausenbeginn um [millis] in die Vergangenheit datieren, damit das
    // Fortsetzen mit einer echten Pausendauer rechnet.
    private fun backdatePause(sequenceId: java.util.UUID, millis: Long) =
        TimingSequenceRepo.update(sequenceId) {
            pausedAtMillis = System.currentTimeMillis() - millis
        }.orDie()

    // The scheduler owns the wall clock, so tests move the sequence's start instant instead of
    // sleeping: shifting startedAtMillis into the past makes exactly the intended slots due.
    private fun shiftStart(sequenceId: java.util.UUID, startedAt: Long) =
        TimingSequenceRepo.update(sequenceId) { startedAtMillis = startedAt }.orDie()
}
