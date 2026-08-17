package de.lambda9.ready2race.backend.app.timing.control

import de.lambda9.ready2race.backend.database.*
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingTimeMarkRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.TIMING_TIME_MARK
import java.util.UUID

object TimingTimeMarkRepo {

    fun create(record: TimingTimeMarkRecord) = TIMING_TIME_MARK.insertReturning(record) { ID }

    fun get(id: UUID) = TIMING_TIME_MARK.selectOne { ID.eq(id) }

    fun exists(id: UUID) = TIMING_TIME_MARK.exists { ID.eq(id) }

    fun getByEvent(eventId: UUID) = TIMING_TIME_MARK.select { EVENT.eq(eventId) }

    fun existsByStation(stationId: UUID) = TIMING_TIME_MARK.exists { STATION.eq(stationId) }

    fun update(id: UUID, f: TimingTimeMarkRecord.() -> Unit) = TIMING_TIME_MARK.update(f) { ID.eq(id) }
}
