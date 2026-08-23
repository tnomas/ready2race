package de.lambda9.ready2race.backend.app.timing.control

import de.lambda9.ready2race.backend.database.*
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingStationRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.TIMING_STATION
import java.util.UUID

object TimingStationRepo {

    fun create(record: TimingStationRecord) = TIMING_STATION.insertReturning(record) { ID }

    fun get(id: UUID) = TIMING_STATION.selectOne { ID.eq(id) }

    fun getByEvent(eventId: UUID) = TIMING_STATION.select { EVENT.eq(eventId) }

    // Pre-check for the (event, name) unique constraint so duplicates surface as a domain error
    // (TimingError.StationNameTaken) instead of a raw constraint-violation defect. `excludingId`
    // lets updateStation check without tripping on the station's own row.
    fun existsByEventAndName(eventId: UUID, name: String, excludingId: UUID? = null) = TIMING_STATION.exists {
        EVENT.eq(eventId).and(NAME.eq(name)).let { cond ->
            excludingId?.let { cond.and(ID.ne(it)) } ?: cond
        }
    }

    // Spiegelt irgendeine ANZEIGE diesen Posten? Vorbau für Typwechsel eines START-Postens, auf
    // den Anzeigen zeigen - der würde die Verknüpfung sonst stillschweigend sinnlos machen.
    fun existsLinkedTo(stationId: UUID) = TIMING_STATION.exists { LINKED_STATION.eq(stationId) }

    fun update(id: UUID, f: TimingStationRecord.() -> Unit) = TIMING_STATION.update(f) { ID.eq(id) }

    fun delete(id: UUID) = TIMING_STATION.delete { ID.eq(id) }
}
