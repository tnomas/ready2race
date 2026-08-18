package de.lambda9.ready2race.backend.app.timing.control

import de.lambda9.ready2race.backend.database.*
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingTimeMarkRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.TIMING_TIME_MARK
import de.lambda9.tailwind.jooq.Jooq
import java.util.UUID

object TimingTimeMarkRepo {

    // Atomic insert used for idempotent creation: if a concurrent request already
    // inserted the same id, this is a no-op instead of a primary-key violation.
    fun createIfAbsent(record: TimingTimeMarkRecord) = Jooq.query {
        insertInto(TIMING_TIME_MARK)
            .set(record)
            .onConflictDoNothing()
            .execute()
    }

    fun get(id: UUID) = TIMING_TIME_MARK.selectOne { ID.eq(id) }

    fun exists(id: UUID) = TIMING_TIME_MARK.exists { ID.eq(id) }

    fun getByEvent(eventId: UUID) = TIMING_TIME_MARK.select { EVENT.eq(eventId) }

    fun existsByStation(stationId: UUID) = TIMING_TIME_MARK.exists { STATION.eq(stationId) }

    fun update(id: UUID, f: TimingTimeMarkRecord.() -> Unit) = TIMING_TIME_MARK.update(f) { ID.eq(id) }

    /**
     * Ids of the RETRACTED marks of an event, optionally narrowed to one station.
     *
     * The status filter lives here rather than in the caller: this list is what the explicit
     * "delete times" action physically removes, and an ACTIVE mark must never end up in it.
     */
    fun getRetractedIds(eventId: UUID, stationId: UUID?) = TIMING_TIME_MARK.select({ ID }) {
        EVENT.eq(eventId).and(STATUS.eq("RETRACTED")).let { cond ->
            stationId?.let { cond.and(STATION.eq(it)) } ?: cond
        }
    }

    fun deleteByIds(ids: List<UUID>) = TIMING_TIME_MARK.delete { ID.`in`(ids) }
}
