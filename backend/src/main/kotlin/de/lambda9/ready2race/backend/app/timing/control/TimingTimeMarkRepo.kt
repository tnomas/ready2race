package de.lambda9.ready2race.backend.app.timing.control

import de.lambda9.ready2race.backend.database.*
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingTimeMarkRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_MATCH_TEAM
import de.lambda9.ready2race.backend.database.generated.tables.references.TIMING_ASSIGNMENT
import de.lambda9.ready2race.backend.database.generated.tables.references.TIMING_TIME_MARK
import de.lambda9.tailwind.jooq.JIO
import de.lambda9.tailwind.jooq.Jooq
import java.util.UUID

/** Eine aktive Marke einer Partie: die Marke plus das Team, dem sie zugeordnet ist. */
data class MatchMarkRow(
    val timeMarkId: UUID,
    val competitionMatchTeam: UUID,
)

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

    /**
     * ALLE ACTIVE Marken, die Teams der Partie [setupMatchId] zugeordnet sind — Start-, Ziel- und
     * Rundenmarken gleichermaßen: genau der „Versuch", den „Start zurücknehmen und neu starten"
     * bündelweise auf RETRACTED stellt. Kein Posten-Typ-Filter: Alte Zielzeiten eines verworfenen
     * Versuchs würden sich sonst durch die Echtzeit-Übernahme sofort mit den neuen Startmarken zu
     * falschen offiziellen Zeiten verrechnen.
     *
     * Der Zuschnitt läuft über die Zuordnung (nicht über den Posten der Sequenz): auch eine von
     * Hand gestempelte und zugeordnete Marke gehört zur Partie und muss mit zurück, sonst stünde
     * nach dem Neustart ein Boot mit zwei aktiven Marken desselben Postens da.
     */
    fun getActiveMarksForMatch(
        eventId: UUID,
        setupMatchId: UUID,
    ): JIO<List<MatchMarkRow>> = Jooq.query {
        select(
            TIMING_TIME_MARK.ID,
            TIMING_ASSIGNMENT.COMPETITION_MATCH_TEAM,
        )
            .from(TIMING_TIME_MARK)
            .join(TIMING_ASSIGNMENT).on(TIMING_ASSIGNMENT.TIME_MARK.eq(TIMING_TIME_MARK.ID))
            .join(COMPETITION_MATCH_TEAM)
            .on(COMPETITION_MATCH_TEAM.ID.eq(TIMING_ASSIGNMENT.COMPETITION_MATCH_TEAM))
            .where(TIMING_TIME_MARK.EVENT.eq(eventId))
            .and(TIMING_TIME_MARK.STATUS.eq("ACTIVE"))
            .and(COMPETITION_MATCH_TEAM.COMPETITION_MATCH.eq(setupMatchId))
            .fetch { record ->
                MatchMarkRow(
                    timeMarkId = record[TIMING_TIME_MARK.ID]!!,
                    competitionMatchTeam = record[TIMING_ASSIGNMENT.COMPETITION_MATCH_TEAM]!!,
                )
            }
    }
}
