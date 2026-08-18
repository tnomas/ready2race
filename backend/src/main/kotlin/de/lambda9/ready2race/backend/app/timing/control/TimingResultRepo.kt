package de.lambda9.ready2race.backend.app.timing.control

import de.lambda9.ready2race.backend.app.timing.entity.TimingStationType
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_MATCH_TEAM
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_REGISTRATION
import de.lambda9.ready2race.backend.database.generated.tables.references.EVENT_REGISTRATION
import de.lambda9.ready2race.backend.database.generated.tables.references.TIMING_ASSIGNMENT
import de.lambda9.ready2race.backend.database.generated.tables.references.TIMING_STATION
import de.lambda9.ready2race.backend.database.generated.tables.references.TIMING_TIME_MARK
import de.lambda9.tailwind.jooq.JIO
import de.lambda9.tailwind.jooq.Jooq
import java.util.UUID

/**
 * One assigned, non-retracted time mark together with the station it was captured on.
 *
 * Serves both consumers of the marks at once: the result computation only looks at
 * [stationType], while the lap writer additionally needs [stationName] and [stationSorting] - they
 * become the name and the position of a `competition_match_team_lap` row.
 */
data class AssignedMarkRow(
    val competitionMatchTeam: UUID,
    val station: UUID,
    val stationType: TimingStationType,
    val stationName: String,
    val stationSorting: Int,
    val timestampMillis: Long,
)

object TimingResultRepo {

    /**
     * Every assigned ACTIVE mark of [eventId], optionally narrowed to [teams].
     *
     * Retracted marks are excluded here rather than filtered later: they are exactly the marks an
     * operator has already declared void, so they must never influence a computed time or a lap.
     */
    fun getAssignedActiveMarks(eventId: UUID, teams: Collection<UUID>? = null): JIO<List<AssignedMarkRow>> =
        Jooq.query {
            select(
                TIMING_ASSIGNMENT.COMPETITION_MATCH_TEAM,
                TIMING_STATION.ID,
                TIMING_STATION.TYPE,
                TIMING_STATION.NAME,
                TIMING_STATION.SORTING,
                TIMING_TIME_MARK.TIMESTAMP_MILLIS,
            )
                .from(TIMING_TIME_MARK)
                .join(TIMING_ASSIGNMENT).on(TIMING_ASSIGNMENT.TIME_MARK.eq(TIMING_TIME_MARK.ID))
                .join(TIMING_STATION).on(TIMING_STATION.ID.eq(TIMING_TIME_MARK.STATION))
                .where(TIMING_TIME_MARK.EVENT.eq(eventId))
                .and(TIMING_TIME_MARK.STATUS.eq("ACTIVE"))
                .let { step ->
                    if (teams == null) step
                    else step.and(TIMING_ASSIGNMENT.COMPETITION_MATCH_TEAM.`in`(teams))
                }
                .fetch { record ->
                    AssignedMarkRow(
                        competitionMatchTeam = record[TIMING_ASSIGNMENT.COMPETITION_MATCH_TEAM]!!,
                        station = record[TIMING_STATION.ID]!!,
                        stationType = TimingStationType.valueOf(record[TIMING_STATION.TYPE]!!),
                        stationName = record[TIMING_STATION.NAME]!!,
                        stationSorting = record[TIMING_STATION.SORTING]!!,
                        timestampMillis = record[TIMING_TIME_MARK.TIMESTAMP_MILLIS]!!,
                    )
                }
        }

    /**
     * Teams of [eventId] that already carry result data - a penalty, a note, a non-finisher flag or
     * a pushed time.
     *
     * The Leitstand's table is built from the marks, and a DNS boat has none: without this second
     * source the row would disappear the instant an operator entered the status, taking the only
     * way to correct it with it.
     */
    fun getTeamIdsWithResultData(eventId: UUID): JIO<List<UUID>> = Jooq.query {
        select(COMPETITION_MATCH_TEAM.ID)
            .from(COMPETITION_MATCH_TEAM)
            .join(COMPETITION_REGISTRATION)
            .on(COMPETITION_REGISTRATION.ID.eq(COMPETITION_MATCH_TEAM.COMPETITION_REGISTRATION))
            .join(EVENT_REGISTRATION).on(EVENT_REGISTRATION.ID.eq(COMPETITION_REGISTRATION.EVENT_REGISTRATION))
            .where(EVENT_REGISTRATION.EVENT.eq(eventId))
            .and(
                COMPETITION_MATCH_TEAM.PENALTY_SECONDS.isNotNull
                    .or(COMPETITION_MATCH_TEAM.PENALTY_NOTE.isNotNull)
                    .or(COMPETITION_MATCH_TEAM.FAILED.isTrue)
                    .or(COMPETITION_MATCH_TEAM.TIMECODE.isNotNull)
            )
            .fetch { it[COMPETITION_MATCH_TEAM.ID]!! }
    }
}
