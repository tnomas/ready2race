package de.lambda9.ready2race.backend.app.timing.control

import de.lambda9.ready2race.backend.app.timing.entity.TimingStationType
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

    /**
     * Whether another SPLIT station of the event already occupies [sorting].
     *
     * There is no database constraint for this - the collision only bites one step later, in
     * `competition_match_team_lap`: a lap's `position` IS the station's sorting and is unique per
     * boat, so two split stations sorted alike silently drop one of the two laps
     * (`TimingLapService.lapRecords` distinctBy). START and FINISH stations are deliberately not
     * part of the check; their sorting only orders the board columns and never becomes a position.
     */
    fun existsByEventAndSplitSorting(eventId: UUID, sorting: Int, excludingId: UUID? = null) =
        TIMING_STATION.exists {
            EVENT.eq(eventId).and(TYPE.eq(TimingStationType.SPLIT.name)).and(SORTING.eq(sorting)).let { cond ->
                excludingId?.let { cond.and(ID.ne(it)) } ?: cond
            }
        }

    fun update(id: UUID, f: TimingStationRecord.() -> Unit) = TIMING_STATION.update(f) { ID.eq(id) }

    fun delete(id: UUID) = TIMING_STATION.delete { ID.eq(id) }
}
