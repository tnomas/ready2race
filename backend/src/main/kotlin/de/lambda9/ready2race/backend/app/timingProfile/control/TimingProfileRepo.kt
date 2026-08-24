package de.lambda9.ready2race.backend.app.timingProfile.control

import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_MATCH
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_PROPERTIES
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_SETUP_MATCH
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_SETUP_ROUND
import de.lambda9.ready2race.backend.database.generated.tables.references.TIMING_PROFILE_ASSIGNMENT
import de.lambda9.tailwind.jooq.Jooq
import org.jooq.impl.DSL
import java.time.LocalDateTime
import java.util.UUID

object TimingProfileRepo {

    /** Eine Zuordnungszeile, auf das Nötige reduziert. */
    data class AssignmentRow(
        val competition: UUID?,
        val round: UUID?,
        val match: UUID?,
        val race: UUID?,
        val mode: UUID?,
    ) {
        /** Genau eine der beiden Spalten ist gesetzt (Check-Constraint), also ist das eindeutig. */
        val profile: UUID get() = race ?: mode!!
    }

    /** Ein Knoten des Strukturbaums, flach gelesen und im Service zusammengesetzt. */
    data class StructureRow(
        val competitionId: UUID,
        val identifier: String,
        val competitionName: String,
        val roundId: UUID?,
        val roundName: String?,
        val nextRound: UUID?,
        val matchId: UUID?,
        val matchName: String?,
        val executionOrder: Int?,
    )

    fun getAssignments(eventId: UUID) = Jooq.query {
        select(
            TIMING_PROFILE_ASSIGNMENT.COMPETITION,
            TIMING_PROFILE_ASSIGNMENT.COMPETITION_SETUP_ROUND,
            TIMING_PROFILE_ASSIGNMENT.COMPETITION_SETUP_MATCH,
            TIMING_PROFILE_ASSIGNMENT.RACECLOCKER_RACE,
            TIMING_PROFILE_ASSIGNMENT.TIMING_MODE,
        )
            .from(TIMING_PROFILE_ASSIGNMENT)
            .where(TIMING_PROFILE_ASSIGNMENT.EVENT.eq(eventId))
            .fetch {
                AssignmentRow(
                    competition = it[TIMING_PROFILE_ASSIGNMENT.COMPETITION],
                    round = it[TIMING_PROFILE_ASSIGNMENT.COMPETITION_SETUP_ROUND],
                    match = it[TIMING_PROFILE_ASSIGNMENT.COMPETITION_SETUP_MATCH],
                    race = it[TIMING_PROFILE_ASSIGNMENT.RACECLOCKER_RACE],
                    mode = it[TIMING_PROFILE_ASSIGNMENT.TIMING_MODE],
                )
            }
    }

    /**
     * Setzt (oder ersetzt) die Zeile für genau diesen Pfad. Erst löschen, dann einfügen: Das ist
     * dieselbe Wirkung wie ein `on conflict do update` über den vierteiligen Schlüssel, aber ohne
     * dass jOOQ den `nulls not distinct`-Index kennen muss.
     */
    fun upsert(
        eventId: UUID,
        competitionId: UUID?,
        roundId: UUID?,
        matchId: UUID?,
        raceId: UUID?,
        modeId: UUID?,
        userId: UUID,
    ) = Jooq.query {
        deleteFrom(TIMING_PROFILE_ASSIGNMENT)
            .where(TIMING_PROFILE_ASSIGNMENT.EVENT.eq(eventId))
            .and(TIMING_PROFILE_ASSIGNMENT.COMPETITION.isNotDistinctFrom(competitionId))
            .and(TIMING_PROFILE_ASSIGNMENT.COMPETITION_SETUP_ROUND.isNotDistinctFrom(roundId))
            .and(TIMING_PROFILE_ASSIGNMENT.COMPETITION_SETUP_MATCH.isNotDistinctFrom(matchId))
            .execute()

        if (raceId != null || modeId != null) {
            val now = LocalDateTime.now()
            insertInto(TIMING_PROFILE_ASSIGNMENT)
                .set(TIMING_PROFILE_ASSIGNMENT.ID, UUID.randomUUID())
                .set(TIMING_PROFILE_ASSIGNMENT.EVENT, eventId)
                .set(TIMING_PROFILE_ASSIGNMENT.COMPETITION, competitionId)
                .set(TIMING_PROFILE_ASSIGNMENT.COMPETITION_SETUP_ROUND, roundId)
                .set(TIMING_PROFILE_ASSIGNMENT.COMPETITION_SETUP_MATCH, matchId)
                .set(TIMING_PROFILE_ASSIGNMENT.RACECLOCKER_RACE, raceId)
                .set(TIMING_PROFILE_ASSIGNMENT.TIMING_MODE, modeId)
                .set(TIMING_PROFILE_ASSIGNMENT.CREATED_AT, now)
                .set(TIMING_PROFILE_ASSIGNMENT.CREATED_BY, userId)
                .set(TIMING_PROFILE_ASSIGNMENT.UPDATED_AT, now)
                .set(TIMING_PROFILE_ASSIGNMENT.UPDATED_BY, userId)
                .execute()
        }
    }

    /**
     * Räumt alles UNTERHALB der angegebenen Ebene ab: ohne [competitionId] alle Zeilen außer der
     * Wurzel, mit [competitionId] die Runden- und Partie-Zeilen dieses Wettkampfs (seine eigene
     * Zeile bleibt stehen). "Alles darunter erbt wieder" ist genau diese Bedeutung.
     */
    fun deleteBelow(eventId: UUID, competitionId: UUID?) = Jooq.query {
        val condition = if (competitionId == null) {
            TIMING_PROFILE_ASSIGNMENT.COMPETITION.isNotNull
        } else {
            TIMING_PROFILE_ASSIGNMENT.COMPETITION.eq(competitionId)
                .and(TIMING_PROFILE_ASSIGNMENT.COMPETITION_SETUP_ROUND.isNotNull)
        }
        deleteFrom(TIMING_PROFILE_ASSIGNMENT)
            .where(TIMING_PROFILE_ASSIGNMENT.EVENT.eq(eventId))
            .and(condition)
            .execute()
    }

    /**
     * Der Strukturbaum: alle Wettkämpfe der Veranstaltung mit ihren Runden und Partien, flach.
     *
     * `competition_properties` trägt laut Check-Constraint auch die Zeilen der Wettkampf-Vorlagen
     * — deshalb der innere Join auf `competition` statt eines Zugriffs allein über die
     * Eigenschaften. `competition_setup` selbst kommt nicht vor: seine Schlüsselspalte IST
     * `competition_properties.id`, also führt `competition_setup_round.competition_setup` direkt
     * dorthin — dieselbe Join-Kette wie in `TimingMatchRepo`. Der Partie-Name ist derselbe wie im
     * Abruf-Kandidaten: `coalesce(competition_match.bye_name, competition_setup_match.name)`;
     * fehlt beides, setzt der Service "Lauf {execution_order}" ein.
     */
    fun getStructure(eventId: UUID) = Jooq.query {
        val matchName = DSL.coalesce(COMPETITION_MATCH.BYE_NAME, COMPETITION_SETUP_MATCH.NAME)
            .`as`("match_name")

        select(
            COMPETITION.ID,
            COMPETITION_PROPERTIES.IDENTIFIER,
            COMPETITION_PROPERTIES.NAME,
            COMPETITION_SETUP_ROUND.ID,
            COMPETITION_SETUP_ROUND.NAME,
            COMPETITION_SETUP_ROUND.NEXT_ROUND,
            COMPETITION_SETUP_MATCH.ID,
            matchName,
            COMPETITION_SETUP_MATCH.EXECUTION_ORDER,
        )
            .from(COMPETITION)
            .join(COMPETITION_PROPERTIES).on(COMPETITION_PROPERTIES.COMPETITION.eq(COMPETITION.ID))
            .leftJoin(COMPETITION_SETUP_ROUND)
            .on(COMPETITION_SETUP_ROUND.COMPETITION_SETUP.eq(COMPETITION_PROPERTIES.ID))
            .leftJoin(COMPETITION_SETUP_MATCH)
            .on(COMPETITION_SETUP_MATCH.COMPETITION_SETUP_ROUND.eq(COMPETITION_SETUP_ROUND.ID))
            .leftJoin(COMPETITION_MATCH)
            .on(COMPETITION_MATCH.COMPETITION_SETUP_MATCH.eq(COMPETITION_SETUP_MATCH.ID))
            .where(COMPETITION.EVENT.eq(eventId))
            .orderBy(COMPETITION_PROPERTIES.IDENTIFIER, COMPETITION_SETUP_MATCH.EXECUTION_ORDER)
            .fetch {
                StructureRow(
                    // Im Schema not null; die Projektion verliert nur die Garantie.
                    competitionId = it[COMPETITION.ID]!!,
                    identifier = it[COMPETITION_PROPERTIES.IDENTIFIER]!!,
                    competitionName = it[COMPETITION_PROPERTIES.NAME]!!,
                    roundId = it[COMPETITION_SETUP_ROUND.ID],
                    roundName = it[COMPETITION_SETUP_ROUND.NAME],
                    nextRound = it[COMPETITION_SETUP_ROUND.NEXT_ROUND],
                    matchId = it[COMPETITION_SETUP_MATCH.ID],
                    matchName = it[matchName],
                    executionOrder = it[COMPETITION_SETUP_MATCH.EXECUTION_ORDER],
                )
            }
    }

    /**
     * Ob dieser Wettkampf zu dieser Veranstaltung gehört.
     *
     * Ein Pfad, der auf einen fremden Wettkampf zeigt, wäre in der Datenbank erlaubt (der
     * Fremdschlüssel kennt die Veranstaltung nicht), fachlich aber eine Zuordnung, die die
     * Auflösung nie findet. Also fragt der Service.
     */
    fun competitionBelongsToEvent(competitionId: UUID, eventId: UUID) = Jooq.query {
        fetchExists(
            selectOne()
                .from(COMPETITION)
                .where(COMPETITION.ID.eq(competitionId))
                .and(COMPETITION.EVENT.eq(eventId))
        )
    }

    /** Ob diese Runde im Setup genau dieses Wettkampfs steht. */
    fun roundBelongsToCompetition(roundId: UUID, competitionId: UUID) = Jooq.query {
        fetchExists(
            selectOne()
                .from(COMPETITION_SETUP_ROUND)
                .join(COMPETITION_PROPERTIES)
                .on(COMPETITION_PROPERTIES.ID.eq(COMPETITION_SETUP_ROUND.COMPETITION_SETUP))
                .where(COMPETITION_SETUP_ROUND.ID.eq(roundId))
                .and(COMPETITION_PROPERTIES.COMPETITION.eq(competitionId))
        )
    }

    /** Ob diese Partie zu dieser Runde gehört. */
    fun matchBelongsToRound(matchId: UUID, roundId: UUID) = Jooq.query {
        fetchExists(
            selectOne()
                .from(COMPETITION_SETUP_MATCH)
                .where(COMPETITION_SETUP_MATCH.ID.eq(matchId))
                .and(COMPETITION_SETUP_MATCH.COMPETITION_SETUP_ROUND.eq(roundId))
        )
    }
}
