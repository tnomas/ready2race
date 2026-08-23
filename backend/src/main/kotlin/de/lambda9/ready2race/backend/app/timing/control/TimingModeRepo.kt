package de.lambda9.ready2race.backend.app.timing.control

import de.lambda9.ready2race.backend.database.*
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingModeRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.TIMING_MODE
import java.util.UUID

object TimingModeRepo {

    fun create(record: TimingModeRecord) = TIMING_MODE.insertReturning(record) { ID }

    fun get(id: UUID) = TIMING_MODE.selectOne { ID.eq(id) }

    fun getByEvent(eventId: UUID) = TIMING_MODE.select { EVENT.eq(eventId) }

    // Vorprüfung des (event, name)-Unique-Constraints, damit Doppelnamen als Domänenfehler
    // auftauchen statt als roher Constraint-Defekt - dasselbe Muster wie TimingStationRepo.
    fun existsByEventAndName(eventId: UUID, name: String, excludingId: UUID? = null) = TIMING_MODE.exists {
        EVENT.eq(eventId).and(NAME.eq(name)).let { cond ->
            excludingId?.let { cond.and(ID.ne(it)) } ?: cond
        }
    }

    fun update(id: UUID, f: TimingModeRecord.() -> Unit) = TIMING_MODE.update(f) { ID.eq(id) }

    fun delete(id: UUID) = TIMING_MODE.delete { ID.eq(id) }
}
