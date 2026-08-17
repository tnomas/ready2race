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
}
