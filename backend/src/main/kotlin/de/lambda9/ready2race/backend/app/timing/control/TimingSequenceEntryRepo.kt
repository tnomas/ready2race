package de.lambda9.ready2race.backend.app.timing.control

import de.lambda9.ready2race.backend.app.timing.entity.SequenceEntryStatus
import de.lambda9.ready2race.backend.database.*
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingStartSequenceEntryRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.TIMING_START_SEQUENCE_ENTRY
import de.lambda9.tailwind.jooq.Jooq
import java.util.UUID

object TimingSequenceEntryRepo {

    fun create(records: Collection<TimingStartSequenceEntryRecord>) = TIMING_START_SEQUENCE_ENTRY.insert(records)

    fun get(id: UUID) = TIMING_START_SEQUENCE_ENTRY.selectOne { ID.eq(id) }

    fun getBySequence(sequenceId: UUID) = TIMING_START_SEQUENCE_ENTRY.select { SEQUENCE.eq(sequenceId) }

    fun existsPending(sequenceId: UUID) = TIMING_START_SEQUENCE_ENTRY.exists {
        SEQUENCE.eq(sequenceId).and(STATUS.eq(SequenceEntryStatus.PENDING.name))
    }

    /**
     * Row-locks the still-pending entries of a sequence for the surrounding transaction. The
     * scheduler job is the only caller: without the lock two application instances (or a job run
     * overlapping a slow predecessor) could both read the same PENDING entry and fire two start
     * marks for one team. Under READ COMMITTED a blocked `for update` re-checks the predicate after
     * the lock is released, so the loser simply sees no pending rows left.
     */
    fun getPendingForUpdate(sequenceId: UUID) = Jooq.query {
        selectFrom(TIMING_START_SEQUENCE_ENTRY)
            .where(
                TIMING_START_SEQUENCE_ENTRY.SEQUENCE.eq(sequenceId)
                    .and(TIMING_START_SEQUENCE_ENTRY.STATUS.eq(SequenceEntryStatus.PENDING.name))
            )
            .orderBy(TIMING_START_SEQUENCE_ENTRY.POSITION)
            .forUpdate()
            .fetch()
            .toList()
    }

    fun update(id: UUID, f: TimingStartSequenceEntryRecord.() -> Unit) =
        TIMING_START_SEQUENCE_ENTRY.update(f) { ID.eq(id) }
}
