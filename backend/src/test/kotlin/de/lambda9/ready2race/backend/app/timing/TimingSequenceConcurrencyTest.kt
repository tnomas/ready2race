package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.timing.boundary.TimingSequenceService
import de.lambda9.ready2race.backend.app.timing.control.TimingSequenceRepo
import de.lambda9.ready2race.backend.app.timing.entity.CreateSequenceRequest
import de.lambda9.ready2race.backend.app.timing.entity.SequenceMode
import de.lambda9.ready2race.backend.app.timing.entity.SequenceState
import de.lambda9.ready2race.backend.app.timing.entity.TimingError
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationType
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.testing.ConcurrentTx
import de.lambda9.ready2race.testing.testCommittingComprehension
import de.lambda9.tailwind.core.extensions.exit.fold
import de.lambda9.tailwind.core.extensions.kio.orDie
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.fail

/**
 * Abbruch gegen Fortsetzen bzw. Starten, gleichzeitig in zwei echten Transaktionen: der Abbruch
 * darf nicht vom zweiten Weg mit RUNNING überschrieben werden - sonst feuerte der Scheduler die
 * übrigen Einträge eines abgebrochenen Starts.
 */
class TimingSequenceConcurrencyTest {

    @Test
    fun abortWinsAgainstConcurrentResume() = testCommittingComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val teams = !createTestMatchTeams(eventId, 2)
        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.INTERVAL, 60_000, teams, 60_000),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id
        !TimingSequenceService.startSequence(sequenceId, userId, eventId)
        !TimingSequenceService.pauseSequence(sequenceId, userId, eventId)

        val (_, resume) = ConcurrentTx.runHoldingFirst(
            env,
            first = TimingSequenceService.abortSequence(sequenceId, userId, eventId),
            second = TimingSequenceService.resumeSequence(sequenceId, userId, eventId),
        )

        resume.fold(
            onSuccess = { fail("Fortsetzen nach Abbruch hätte abgewiesen werden müssen") },
            onError = { assertEquals(TimingError.SequenceStateConflict, it) },
            onDefect = { fail("Fortsetzen starb: $it") },
        )
        assertEquals(SequenceState.ABORTED.name, (!TimingSequenceRepo.get(sequenceId).orDie())!!.state)
    }

    @Test
    fun abortWinsAgainstConcurrentStart() = testCommittingComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val teams = !createTestMatchTeams(eventId, 2)
        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.INTERVAL, 60_000, teams, 60_000),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id

        val (_, start) = ConcurrentTx.runHoldingFirst(
            env,
            first = TimingSequenceService.abortSequence(sequenceId, userId, eventId),
            second = TimingSequenceService.startSequence(sequenceId, userId, eventId),
        )

        start.fold(
            onSuccess = { fail("Starten nach Abbruch hätte abgewiesen werden müssen") },
            onError = { assertEquals(TimingError.SequenceStateConflict, it) },
            onDefect = { fail("Starten starb: $it") },
        )
        assertEquals(SequenceState.ABORTED.name, (!TimingSequenceRepo.get(sequenceId).orDie())!!.state)
    }
}
