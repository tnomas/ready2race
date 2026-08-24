package de.lambda9.ready2race.backend.app.timingProfile

import org.flywaydb.core.Flyway
import org.testcontainers.containers.PostgreSQLContainer
import java.sql.Connection
import java.sql.DriverManager
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Die Migration V202608242100 gegen echte Altdaten: Typ-Zuordnungen und das je Wettkampf
 * angewählte Rennen müssen als Zeilen der neuen Zuordnungstabelle ankommen. Ein Fehler darin
 * verlöre bei einer laufenden Regatta still die Zuordnung — und einen Rollback ohne Dump gibt es
 * nicht.
 *
 * Eigener Container wie bei [RaceClockerSingleRaceMigrationTest]: Der übliche Testcontainer
 * migriert immer bis zum Ende, und über einer leeren Datenbank gäbe es nichts zu übernehmen.
 */
class TimingProfileMigrationTest {

    private val eventId = UUID.randomUUID()
    private val raceCompetitionId = UUID.randomUUID()
    private val modeCompetitionId = UUID.randomUUID()
    private val raceId = UUID.randomUUID()
    private val modeId = UUID.randomUUID()
    private val roundId = UUID.randomUUID()
    private val competitionPropertiesId = UUID.randomUUID()

    @Test
    fun `uebernimmt Typ-Zuordnungen und das angewaehlte Rennen`() {
        val postgres = PostgreSQLContainer("postgres:17")
        postgres.start()
        try {
            // Der letzte Stand vor der neuen Migration.
            flyway(postgres).target("202608211480").skipDefaultCallbacks(true).load().migrate()
            connect(postgres).use { seedLegacyState(it) }
            flyway(postgres).load().migrate()

            connect(postgres).use { conn ->
                // Das Rennen des Wettkampfs ist eine Wettkampf-Zeile geworden.
                assertEquals(
                    raceId,
                    queryUuid(
                        conn,
                        "select raceclocker_race from ready2race.timing_profile_assignment " +
                            "where competition = ? and competition_setup_round is null " +
                            "and competition_setup_match is null",
                        raceCompetitionId,
                    ),
                )
                // Die Runden-Zuordnung des Zeitnahmetyps ebenso, mit ihrer Veranstaltung.
                assertEquals(
                    modeId,
                    queryUuid(
                        conn,
                        "select timing_mode from ready2race.timing_profile_assignment " +
                            "where competition_setup_round = ?",
                        roundId,
                    ),
                )
                assertEquals(
                    eventId,
                    queryUuid(
                        conn,
                        "select event from ready2race.timing_profile_assignment where competition_setup_round = ?",
                        roundId,
                    ),
                )
                assertEquals(2, count(conn, "select count(*) from ready2race.timing_profile_assignment"))
            }
        } finally {
            postgres.stop()
        }
    }

    private fun flyway(postgres: PostgreSQLContainer<*>) = Flyway.configure()
        .dataSource(postgres.jdbcUrl, postgres.username, postgres.password)
        .defaultSchema("ready2race")

    private fun connect(postgres: PostgreSQLContainer<*>): Connection =
        DriverManager.getConnection(postgres.jdbcUrl, postgres.username, postgres.password)

    private fun seedLegacyState(conn: Connection) {
        exec(conn, "insert into ready2race.event (id, name, created_at, updated_at) values (?, 'Testregatta', now(), now())", eventId)
        exec(
            conn,
            "insert into ready2race.raceclocker_race (id, event, name, results_url, captures_laps, position, created_at, updated_at) " +
                "values (?, ?, 'Kurzstrecke', 'https://raceclocker.com/kurz', false, 1, now(), now())",
            raceId, eventId,
        )
        exec(
            conn,
            "insert into ready2race.timing_mode (id, event, name, with_laps, start_grouping, lead_in_seconds, created_at, updated_at) " +
                "values (?, ?, 'Timetrial 30s', false, 'EINZEL', 10, now(), now())",
            modeId, eventId,
        )
        exec(conn, "insert into ready2race.competition (id, event, created_at, updated_at, raceclocker_race) values (?, ?, now(), now(), ?)", raceCompetitionId, eventId, raceId)
        exec(conn, "insert into ready2race.competition (id, event, created_at, updated_at) values (?, ?, now(), now())", modeCompetitionId, eventId)
        exec(
            conn,
            "insert into ready2race.competition_properties (id, competition, identifier, name) values (?, ?, 'T1', 'Testwettkampf')",
            competitionPropertiesId, modeCompetitionId,
        )
        exec(
            conn,
            "insert into ready2race.competition_setup (competition_properties, created_at, updated_at) values (?, now(), now())",
            competitionPropertiesId,
        )
        exec(
            conn,
            "insert into ready2race.competition_setup_round (id, competition_setup, name, required, use_default_seeding, places_option) " +
                "values (?, ?, 'Vorlauf', true, true, 'ASCENDING')",
            roundId, competitionPropertiesId,
        )
        exec(
            conn,
            "insert into ready2race.timing_mode_assignment (id, competition, competition_setup_round, timing_mode, created_at, updated_at) " +
                "values (?, ?, ?, ?, now(), now())",
            UUID.randomUUID(), modeCompetitionId, roundId, modeId,
        )
    }

    private fun exec(conn: Connection, sql: String, vararg args: Any?) =
        conn.prepareStatement(sql).use { stmt ->
            args.forEachIndexed { index, value -> stmt.setObject(index + 1, value) }
            stmt.executeUpdate()
        }

    private fun queryUuid(conn: Connection, sql: String, id: UUID): UUID? =
        conn.prepareStatement(sql).use { stmt ->
            stmt.setObject(1, id)
            stmt.executeQuery().use { rs ->
                if (!rs.next()) null else rs.getObject(1, UUID::class.java)
            }
        }

    private fun count(conn: Connection, sql: String): Int =
        conn.prepareStatement(sql).use { stmt ->
            stmt.executeQuery().use { rs ->
                rs.next()
                rs.getInt(1)
            }
        }
}
