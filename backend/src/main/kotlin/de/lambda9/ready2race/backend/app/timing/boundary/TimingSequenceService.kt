package de.lambda9.ready2race.backend.app.timing.boundary

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.ServiceError
import de.lambda9.ready2race.backend.app.competitionExecution.control.CompetitionMatchTeamRepo
import de.lambda9.ready2race.backend.app.timing.control.*
import de.lambda9.ready2race.backend.app.timing.entity.*
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.calls.responses.ApiResponse.Companion.noData
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingAssignmentRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingStartSequenceEntryRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingStartSequenceRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingTimeMarkRecord
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.onNullFail
import de.lambda9.tailwind.core.extensions.kio.orDie
import de.lambda9.tailwind.core.extensions.kio.traverse
import java.time.LocalDateTime
import java.util.UUID

/**
 * Server-driven start sequences: an ordered list of teams that is started by one operator action and
 * then fires its start marks on the server's clock, so every connected board counts down to the same
 * instant.
 *
 * The mutations here are called from routes and therefore run inside `respondKIO`'s transaction;
 * [fireDueEntries] is called from the scheduler and documents its own transaction/broadcast contract.
 */
object TimingSequenceService {

    fun createSequence(
        request: CreateSequenceRequest,
        userId: UUID,
        eventId: UUID,
    ): App<ServiceError, ApiResponse.Created> = KIO.comprehension {
        val station = !TimingStationRepo.get(request.station).orDie().onNullFail { TimingError.StationNotFound }
        !KIO.failOn(station.event != eventId) { TimingError.EventMismatch }
        !KIO.failOn(station.type != TimingStationType.START.name) { TimingError.StationNotStartType }

        // A station can only fire one start at a time; two live sequences would race for the same
        // physical start line (and produce competing marks on the same station).
        val stationBusy = !TimingSequenceRepo.existsActiveForStation(request.station).orDie()
        !KIO.failOn(stationBusy) { TimingError.SequenceAlreadyActive }

        !request.teams.traverse { teamId ->
            KIO.comprehension {
                val teamEvent = !CompetitionMatchTeamRepo.getEventId(teamId).orDie()
                    .onNullFail { TimingError.TeamNotFound }
                !KIO.failOn(teamEvent != eventId) { TimingError.EventMismatch }
                KIO.ok(Unit)
            }
        }

        val now = LocalDateTime.now()
        val sequenceId = UUID.randomUUID()
        !TimingSequenceRepo.create(
            TimingStartSequenceRecord(
                id = sequenceId,
                event = eventId,
                station = request.station,
                mode = request.mode.name,
                // MASS has no cadence - never persist a stray interval that would confuse the DTO.
                intervalMillis = request.intervalMillis.takeIf { request.mode == SequenceMode.INTERVAL },
                state = SequenceState.ARMED.name,
                startedAtMillis = null,
                createdAt = now,
                createdBy = userId,
                updatedAt = now,
                updatedBy = userId,
            )
        ).orDie()

        // The request's list order IS the start order: the index becomes the position, and the
        // position is the slot the entry fires in - which is why skipping never shifts anyone.
        !TimingSequenceEntryRepo.create(
            request.teams.mapIndexed { index, teamId ->
                TimingStartSequenceEntryRecord(
                    id = UUID.randomUUID(),
                    sequence = sequenceId,
                    competitionMatchTeam = teamId,
                    position = index,
                    status = SequenceEntryStatus.PENDING.name,
                    timeMark = null,
                )
            }
        ).orDie()

        KIO.ok(ApiResponse.Created(sequenceId))
    }

    fun getActiveSequence(
        eventId: UUID,
        stationId: UUID,
    ): App<ServiceError, ApiResponse> = KIO.comprehension {
        val station = !TimingStationRepo.get(stationId).orDie().onNullFail { TimingError.StationNotFound }
        !KIO.failOn(station.event != eventId) { TimingError.EventMismatch }

        val sequence = !TimingSequenceRepo.getActiveByStation(stationId).orDie()
        val dto = if (sequence == null) {
            null
        } else {
            val entries = !TimingSequenceEntryRepo.getBySequence(sequence.id).orDie()
            sequenceDto(sequence, entries)
        }
        KIO.ok(ApiResponse.Dto(ActiveSequenceDto(dto)))
    }

    fun startSequence(
        sequenceId: UUID,
        userId: UUID,
        eventId: UUID,
    ): App<TimingError, ApiResponse.NoData> = KIO.comprehension {
        val sequence = !getSequenceOfEvent(sequenceId, eventId)
        !KIO.failOn(sequence.stateEnum != SequenceState.ARMED) { TimingError.SequenceStateConflict }

        // The server's clock is the record: every board derives its countdown from this instant plus
        // its own measured clock offset, so nobody counts down against their local time.
        val startedAt = System.currentTimeMillis()
        !TimingSequenceRepo.update(sequenceId) {
            state = SequenceState.RUNNING.name
            startedAtMillis = startedAt
            updatedAt = LocalDateTime.now()
            updatedBy = userId
        }.orDie().onNullFail { TimingError.SequenceNotFound }
        noData
    }

    fun abortSequence(
        sequenceId: UUID,
        userId: UUID,
        eventId: UUID,
    ): App<TimingError, ApiResponse.NoData> = KIO.comprehension {
        val sequence = !getSequenceOfEvent(sequenceId, eventId)
        !KIO.failOn(!sequence.stateEnum.isActive) { TimingError.SequenceStateConflict }

        // Leaves already fired entries (and their marks) alone - only the pending ones are called
        // off, which is exactly what an abort means at a start line.
        !TimingSequenceRepo.update(sequenceId) {
            state = SequenceState.ABORTED.name
            updatedAt = LocalDateTime.now()
            updatedBy = userId
        }.orDie().onNullFail { TimingError.SequenceNotFound }
        noData
    }

    fun skipEntry(
        entryId: UUID,
        userId: UUID,
        eventId: UUID,
    ): App<TimingError, ApiResponse.NoData> = KIO.comprehension {
        val entry = !TimingSequenceEntryRepo.get(entryId).orDie().onNullFail { TimingError.SequenceEntryNotFound }
        val sequence = !getSequenceOfEvent(entry.sequence, eventId)
        !KIO.failOn(!sequence.stateEnum.isActive) { TimingError.SequenceStateConflict }
        !KIO.failOn(entry.status != SequenceEntryStatus.PENDING.name) { TimingError.SequenceStateConflict }

        !TimingSequenceEntryRepo.update(entryId) {
            status = SequenceEntryStatus.SKIPPED.name
        }.orDie().onNullFail { TimingError.SequenceEntryNotFound }

        // Entries carry no audit columns of their own, so the change is recorded on the sequence.
        !TimingSequenceRepo.update(entry.sequence) {
            updatedAt = LocalDateTime.now()
            updatedBy = userId
        }.orDie()

        // Deliberately does not complete the sequence when this was the last pending entry: the
        // scheduler owns the DONE transition and picks it up on its next tick (within a second).
        noData
    }

    /**
     * Fires every start entry that has come due and completes sequences that have nothing left to
     * fire. This is the scheduler's job body.
     *
     * Transactionality: this function does NOT open a transaction of its own - the caller wraps it
     * (see `Application.scheduleJobs`, which calls `.transact()`). That makes one run atomic: mark,
     * assignment and the entry's status flip either all land or none do, so a crash mid-run can
     * never leave an entry marked STARTED without its mark, or vice versa.
     *
     * Idempotency: pending entries are row-locked for the transaction
     * ([TimingSequenceEntryRepo.getPendingForUpdate]), and only PENDING entries are ever considered,
     * so a re-run after a rollback re-fires exactly what is still due, and a concurrent runner sees
     * no work left. [TimingTimeMarkRepo.createIfAbsent] is the same race-safe insert the manual
     * capture path uses.
     *
     * Broadcasts: none happen here - see [FireResult] and [broadcastFireResult].
     */
    fun fireDueEntries(): App<Nothing, FireResult> = KIO.comprehension {
        val now = System.currentTimeMillis()
        val running = !TimingSequenceRepo.getRunning().orDie()
        if (running.isEmpty()) return@comprehension KIO.ok(FireResult.empty)

        val outcomes = !running.traverse { sequence -> fireSequence(sequence, now) }
        KIO.ok(
            FireResult(
                fired = outcomes.flatMap { it.fired },
                changedSequences = outcomes.mapNotNull { it.changed },
            )
        )
    }

    /**
     * Sends the websocket messages for a finished [fireDueEntries] run.
     *
     * Must be called only after the transaction that ran it committed. The scheduler runs outside
     * `respondKIO`, so `AfterCommit` has no buffer installed and would fire its effect immediately -
     * i.e. mid-transaction. Calling the broadcaster here, from the job body after `transact`
     * returned successfully, reproduces the after-commit guarantee by hand.
     *
     * Sequence-level messages are not sent yet; [FireResult.changedSequences] already carries the
     * fully built DTOs for them, so adding that message type only means adding one broadcast line
     * here.
     */
    fun broadcastFireResult(result: FireResult) {
        result.fired.forEach { entry ->
            val eventId = entry.mark.event
            TimingBroadcaster.broadcast(eventId, TimingWsMessage.TimeMarkCreated(entry.mark))
            TimingBroadcaster.broadcast(
                eventId,
                TimingWsMessage.AssignmentChanged(entry.mark.id, entry.mark.assignedTeam),
            )
        }
    }

    private data class SequenceOutcome(
        val fired: List<FiredEntry>,
        val changed: TimingSequenceDto?,
    )

    private fun fireSequence(
        sequence: TimingStartSequenceRecord,
        now: Long,
    ): App<Nothing, SequenceOutcome> = KIO.comprehension {
        val pending = !TimingSequenceEntryRepo.getPendingForUpdate(sequence.id).orDie()
        val due = pending.filter { entry ->
            val planned = plannedStartMillis(sequence, entry.position)
            planned != null && planned <= now
        }

        val fired = !due.traverse { entry -> fireEntry(sequence, entry) }

        // Everything that was pending and did not just fire is what remains; a sequence with
        // nothing left (all started or skipped) is finished.
        val completed = pending.size == due.size
        if (completed) {
            !TimingSequenceRepo.update(sequence.id) {
                state = SequenceState.DONE.name
                updatedAt = LocalDateTime.now()
            }.orDie()
        }

        if (fired.isEmpty() && !completed) {
            KIO.ok(SequenceOutcome(emptyList(), null))
        } else {
            // Re-read so the broadcast payload reflects the post-run truth rather than the record
            // this run started from.
            val updated = !TimingSequenceRepo.get(sequence.id).orDie()
            val entries = !TimingSequenceEntryRepo.getBySequence(sequence.id).orDie()
            KIO.ok(SequenceOutcome(fired, sequenceDto(updated ?: sequence, entries)))
        }
    }

    private fun fireEntry(
        sequence: TimingStartSequenceRecord,
        entry: TimingStartSequenceEntryRecord,
    ): App<Nothing, FiredEntry> = KIO.comprehension {
        val now = LocalDateTime.now()
        val markId = UUID.randomUUID()
        // The mark carries the PLANNED instant, not the moment the job happened to run: a scheduler
        // tick that is late by a few hundred milliseconds must not distort the recorded start.
        val plannedAt = plannedStartMillis(sequence, entry.position)!!

        val mark = TimingTimeMarkRecord(
            id = markId,
            event = sequence.event,
            station = sequence.station,
            timestampMillis = plannedAt,
            source = "APP_USER",
            status = "ACTIVE",
            createdAt = now,
            createdBy = sequence.createdBy,
        )
        !TimingTimeMarkRepo.createIfAbsent(mark).orDie()
        !TimingAssignmentRepo.create(
            TimingAssignmentRecord(
                id = UUID.randomUUID(),
                timeMark = markId,
                competitionMatchTeam = entry.competitionMatchTeam,
                createdAt = now,
                createdBy = sequence.createdBy,
                updatedAt = now,
                updatedBy = sequence.createdBy,
            )
        ).orDie()
        !TimingSequenceEntryRepo.update(entry.id) {
            status = SequenceEntryStatus.STARTED.name
            timeMark = markId
        }.orDie()

        KIO.ok(
            FiredEntry(
                sequenceId = sequence.id,
                entryId = entry.id,
                mark = timeMarkDto(mark, entry.competitionMatchTeam),
            )
        )
    }

    private fun getSequenceOfEvent(
        sequenceId: UUID,
        eventId: UUID,
    ): App<TimingError, TimingStartSequenceRecord> = KIO.comprehension {
        val sequence = !TimingSequenceRepo.get(sequenceId).orDie().onNullFail { TimingError.SequenceNotFound }
        !KIO.failOn(sequence.event != eventId) { TimingError.EventMismatch }
        KIO.ok(sequence)
    }

    private val TimingStartSequenceRecord.stateEnum: SequenceState
        get() = SequenceState.valueOf(state!!)
}
