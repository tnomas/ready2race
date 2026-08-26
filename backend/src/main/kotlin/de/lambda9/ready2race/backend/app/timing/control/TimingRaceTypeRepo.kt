package de.lambda9.ready2race.backend.app.timing.control

import de.lambda9.ready2race.backend.app.timingConfig.entity.TimingSystem
import de.lambda9.ready2race.backend.database.*
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingRaceTypeRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.*
import de.lambda9.tailwind.jooq.JIO
import de.lambda9.tailwind.jooq.Jooq
import org.jooq.impl.DSL
import java.util.UUID

object TimingRaceTypeRepo {

    fun create(record: TimingRaceTypeRecord) = TIMING_RACE_TYPE.insertReturning(record) { ID }

    fun get(id: UUID) = TIMING_RACE_TYPE.selectOne { ID.eq(id) }

    fun getByEvent(eventId: UUID) = TIMING_RACE_TYPE.select { EVENT.eq(eventId) }

    // Pre-check for the (event, name) unique constraint, so a duplicate surfaces as a domain error
    // instead of a raw constraint-violation defect (mirrors TimingStationRepo.existsByEventAndName).
    fun existsByEventAndName(eventId: UUID, name: String, excludingId: UUID? = null) = TIMING_RACE_TYPE.exists {
        EVENT.eq(eventId).and(NAME.eq(name)).let { cond ->
            excludingId?.let { cond.and(ID.ne(it)) } ?: cond
        }
    }

    /**
     * Of [ids], those that are race types of [eventId].
     *
     * The setup editor sends race type ids inside the setup body, so this is where a foreign (or
     * stale) id is caught before it reaches the foreign key - a raw FK violation would surface as a
     * 500, and an id from another event would silently steer that event's boards.
     */
    fun getIdsInEvent(eventId: UUID, ids: Collection<UUID>): JIO<Set<UUID>> = Jooq.query {
        if (ids.isEmpty()) return@query emptySet()
        select(TIMING_RACE_TYPE.ID)
            .from(TIMING_RACE_TYPE)
            .where(TIMING_RACE_TYPE.EVENT.eq(eventId))
            .and(TIMING_RACE_TYPE.ID.`in`(ids))
            .fetchSet(TIMING_RACE_TYPE.ID)
            .filterNotNull()
            .toSet()
    }

    fun update(id: UUID, f: TimingRaceTypeRecord.() -> Unit) = TIMING_RACE_TYPE.update(f) { ID.eq(id) }

    fun delete(id: UUID) = TIMING_RACE_TYPE.delete { ID.eq(id) }

    /**
     * The event's matches flattened to what [TimingRaceTypeResolution] decides on: schedule time,
     * started state and the race type of the match's round.
     *
     * Scoped to competitions this application times (same effective-timing-system rule as
     * [TimingTeamRepo]) - a RaceClocker competition's running order must not steer our start board.
     */
    fun getScheduledMatches(eventId: UUID): JIO<List<TimingRaceTypeResolution.ScheduledMatch>> = Jooq.query {
        select(
            COMPETITION_MATCH.START_TIME,
            COMPETITION_MATCH.STARTED_AT,
            COMPETITION_MATCH.FINISHED_AT,
            COMPETITION_SETUP_ROUND.TIMING_RACE_TYPE,
        )
            .from(COMPETITION_MATCH)
            .join(COMPETITION_SETUP_MATCH)
            .on(COMPETITION_MATCH.COMPETITION_SETUP_MATCH.eq(COMPETITION_SETUP_MATCH.ID))
            .join(COMPETITION_SETUP_ROUND)
            .on(COMPETITION_SETUP_MATCH.COMPETITION_SETUP_ROUND.eq(COMPETITION_SETUP_ROUND.ID))
            .join(COMPETITION_PROPERTIES)
            .on(COMPETITION_SETUP_ROUND.COMPETITION_SETUP.eq(COMPETITION_PROPERTIES.ID))
            .join(COMPETITION).on(COMPETITION_PROPERTIES.COMPETITION.eq(COMPETITION.ID))
            .join(EVENT).on(COMPETITION.EVENT.eq(EVENT.ID))
            .where(COMPETITION.EVENT.eq(eventId))
            .and(DSL.coalesce(COMPETITION.TIMING_SYSTEM, EVENT.TIMING_SYSTEM).eq(TimingSystem.READY2RACE.name))
            // Only a tie-breaker for matches sharing a start time; which match wins is decided in
            // TimingRaceTypeResolution, where it can be tested without a database.
            .orderBy(COMPETITION_MATCH.START_TIME.asc().nullsLast(), COMPETITION_SETUP_MATCH.EXECUTION_ORDER.asc())
            .fetch { record ->
                TimingRaceTypeResolution.ScheduledMatch(
                    startTime = record[COMPETITION_MATCH.START_TIME],
                    startedAt = record[COMPETITION_MATCH.STARTED_AT],
                    finishedAt = record[COMPETITION_MATCH.FINISHED_AT],
                    raceType = record[COMPETITION_SETUP_ROUND.TIMING_RACE_TYPE],
                )
            }
    }
}
