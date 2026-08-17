package de.lambda9.ready2race.backend.app.timing.control

import de.lambda9.ready2race.backend.database.*
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingStationRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.TIMING_STATION
import java.util.UUID

object TimingStationRepo {

    fun create(record: TimingStationRecord) = TIMING_STATION.insertReturning(record) { ID }

    fun get(id: UUID) = TIMING_STATION.selectOne { ID.eq(id) }

    fun getByEvent(eventId: UUID) = TIMING_STATION.select { EVENT.eq(eventId) }

    fun update(id: UUID, f: TimingStationRecord.() -> Unit) = TIMING_STATION.update(f) { ID.eq(id) }

    fun delete(id: UUID) = TIMING_STATION.delete { ID.eq(id) }
}
