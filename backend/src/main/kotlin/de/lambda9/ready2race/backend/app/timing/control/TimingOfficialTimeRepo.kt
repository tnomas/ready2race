package de.lambda9.ready2race.backend.app.timing.control

import de.lambda9.ready2race.backend.app.timing.entity.TimingStationType
import de.lambda9.ready2race.backend.database.*
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingOfficialTimeRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.TIMING_ASSIGNMENT
import de.lambda9.ready2race.backend.database.generated.tables.references.TIMING_OFFICIAL_TIME
import de.lambda9.ready2race.backend.database.generated.tables.references.TIMING_STATION
import de.lambda9.ready2race.backend.database.generated.tables.references.TIMING_TIME_MARK
import de.lambda9.tailwind.jooq.JIO
import de.lambda9.tailwind.jooq.Jooq
import java.time.LocalDateTime
import java.util.UUID

/** One assigned, non-retracted time mark, reduced to what the official-time computation needs. */
data class AssignedMarkRow(
    val competitionMatchTeam: UUID,
    val stationType: TimingStationType,
    val timestampMillis: Long,
)

object TimingOfficialTimeRepo {

    fun create(record: TimingOfficialTimeRecord) = TIMING_OFFICIAL_TIME.insertReturning(record) { ID }

    /**
     * Race-safe insert for the boundary layer's read-then-insert upsert: two concurrent upserts for
     * the same team (e.g. two overlapping computes, or a compute racing a manual override) can both
     * read no existing row and both try to insert. The unique constraint on `competition_match_team`
     * would turn the loser's insert into an uncaught 500; this makes it a no-op instead, so the
     * caller can fall back to an update. Returns the number of rows inserted (0 or 1).
     */
    fun createIfAbsent(record: TimingOfficialTimeRecord): JIO<Int> = Jooq.query {
        insertInto(TIMING_OFFICIAL_TIME)
            .set(record)
            .onConflictDoNothing()
            .execute()
    }

    fun getByTeam(teamId: UUID) = TIMING_OFFICIAL_TIME.selectOne { COMPETITION_MATCH_TEAM.eq(teamId) }

    fun getByEvent(eventId: UUID) = TIMING_OFFICIAL_TIME.select { EVENT.eq(eventId) }

    fun getByTeams(teamIds: List<UUID>) = TIMING_OFFICIAL_TIME.select { COMPETITION_MATCH_TEAM.`in`(teamIds) }

    fun update(teamId: UUID, f: TimingOfficialTimeRecord.() -> Unit) =
        TIMING_OFFICIAL_TIME.update(f) { COMPETITION_MATCH_TEAM.eq(teamId) }

    /**
     * Every assigned ACTIVE mark of [eventId] with the type of the station it was captured on.
     *
     * Retracted marks are excluded here rather than filtered later: they are exactly the marks an
     * operator has already declared void, so they must not influence a computed time.
     */
    fun getAssignedActiveMarks(eventId: UUID): JIO<List<AssignedMarkRow>> = Jooq.query {
        select(
            TIMING_ASSIGNMENT.COMPETITION_MATCH_TEAM,
            TIMING_STATION.TYPE,
            TIMING_TIME_MARK.TIMESTAMP_MILLIS,
        )
            .from(TIMING_TIME_MARK)
            .join(TIMING_ASSIGNMENT).on(TIMING_ASSIGNMENT.TIME_MARK.eq(TIMING_TIME_MARK.ID))
            .join(TIMING_STATION).on(TIMING_STATION.ID.eq(TIMING_TIME_MARK.STATION))
            .where(TIMING_TIME_MARK.EVENT.eq(eventId))
            .and(TIMING_TIME_MARK.STATUS.eq("ACTIVE"))
            .fetch { record ->
                AssignedMarkRow(
                    competitionMatchTeam = record[TIMING_ASSIGNMENT.COMPETITION_MATCH_TEAM]!!,
                    stationType = TimingStationType.valueOf(record[TIMING_STATION.TYPE]!!),
                    timestampMillis = record[TIMING_TIME_MARK.TIMESTAMP_MILLIS]!!,
                )
            }
    }
}
