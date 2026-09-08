package de.lambda9.ready2race.backend.app.timingProfile

import org.flywaydb.core.Flyway
import org.testcontainers.containers.PostgreSQLContainer
import java.nio.file.Files
import java.nio.file.Path
import java.sql.Connection
import java.sql.DriverManager
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Das Pre-flight-Skript `docs/migration-preflight-lambda9.sql` gegen den Schema-Stand, für den es
 * geschrieben ist (vor V202608242100). Es muss dort laufen und genau die Fälle nennen, die die
 * Migrationen danach still verwerfen: einen Wettkampf mit eigener Zeitnahme-Konfiguration und
 * einen Wettkampf, an dem Zeitnahmetyp-Zuordnung und angewähltes Rennen kollidieren.
 *
 * Eigener Container wie bei [TimingProfileMigrationTest]: Der übliche Testcontainer migriert immer
 * bis zum Ende, und dort gibt es die geprüften Spalten nicht mehr.
 */
class MigrationPreflightScriptTest {

    private val eventId = UUID.randomUUID()
    private val lossCompetitionId = UUID.randomUUID()
    private val collisionCompetitionId = UUID.randomUUID()
    private val cleanCompetitionId = UUID.randomUUID()
    private val raceId = UUID.randomUUID()
    private val modeId = UUID.randomUUID()

    @Test
    fun `nennt Verlust und Kollision und schweigt beim sauberen Wettkampf`() {
        val postgres = PostgreSQLContainer("postgres:17")
        postgres.start()
        try {
            Flyway.configure()
                .dataSource(postgres.jdbcUrl, postgres.username, postgres.password)
                .defaultSchema("ready2race")
                .target("202608211480")
                .skipDefaultCallbacks(true)
                .load()
                .migrate()

            DriverManager.getConnection(postgres.jdbcUrl, postgres.username, postgres.password).use { conn ->
                seedLegacyState(conn)

                val results = runScript(conn, readScript())
                // set search_path liefert kein Ergebnis; drei Abfragen tun es.
                assertEquals(3, results.size, "Das Skript hat drei Prüfabfragen")

                val (loss, collision, hint) = results
                assertEquals(listOf(lossCompetitionId), loss.map { it["competition_id"] })
                assertEquals(listOf(collisionCompetitionId), collision.map { it["competition_id"] })
                assertTrue(
                    collision.single()["gewinnt"].toString().startsWith("Rennen"),
                    "Bei einer RACECLOCKER-Veranstaltung gewinnt das Rennen",
                )
                // Die Typ-Zuordnung an der RACECLOCKER-Veranstaltung ist tote Datenlage - der
                // Hinweis nennt die Veranstaltung.
                assertEquals(listOf(eventId), hint.map { it["event_id"] })
            }
        } finally {
            postgres.stop()
        }
    }

    private fun readScript(): String {
        // Vom Modulverzeichnis (Maven) oder vom Wurzelverzeichnis aus auffindbar.
        val candidates = listOf(
            Path.of("..", "docs", "migration-preflight-lambda9.sql"),
            Path.of("docs", "migration-preflight-lambda9.sql"),
        )
        val path = candidates.firstOrNull { Files.exists(it) }
            ?: error("Pre-flight-Skript nicht gefunden: $candidates")
        return Files.readString(path)
    }

    /** Führt jede Anweisung aus und sammelt die Ergebniszeilen der Abfragen (Spaltenname -> Wert). */
    private fun runScript(conn: Connection, script: String): List<List<Map<String, Any?>>> {
        val statements = script.lines()
            .filterNot { it.trimStart().startsWith("--") }
            .joinToString("\n")
            .split(";")
            .map { it.trim() }
            .filter { it.isNotEmpty() }

        return statements.mapNotNull { sql ->
            conn.createStatement().use { stmt ->
                val hasResult = stmt.execute(sql)
                if (!hasResult) return@use null
                stmt.resultSet.use { rs ->
                    val meta = rs.metaData
                    val rows = mutableListOf<Map<String, Any?>>()
                    while (rs.next()) {
                        rows += (1..meta.columnCount).associate { meta.getColumnLabel(it) to rs.getObject(it) }
                    }
                    rows
                }
            }
        }
    }

    private fun seedLegacyState(conn: Connection) {
        exec(
            conn,
            "insert into ready2race.event (id, name, created_at, updated_at, timing_system) " +
                "values (?, 'Testregatta', now(), now(), 'RACECLOCKER')",
            eventId,
        )
        exec(
            conn,
            "insert into ready2race.raceclocker_race (id, event, name, results_url, captures_laps, position, created_at, updated_at) " +
                "values (?, ?, 'Kurzstrecke', 'https://raceclocker.com/kurz', false, 1, now(), now())",
            raceId, eventId,
        )
        exec(
            conn,
            "insert into ready2race.timing_mode (id, event, name, start_grouping, lead_in_seconds, created_at, updated_at) " +
                "values (?, ?, 'Massenstart', 'WELLE', 10, now(), now())",
            modeId, eventId,
        )

        // Verlust: eigene Zeitnahme-Konfiguration am Wettkampf.
        exec(
            conn,
            "insert into ready2race.competition (id, event, created_at, updated_at, timing_system) values (?, ?, now(), now(), 'INTERN')",
            lossCompetitionId, eventId,
        )
        exec(
            conn,
            "insert into ready2race.competition_properties (id, competition, identifier, name) values (?, ?, 'V1', 'Verlust')",
            UUID.randomUUID(), lossCompetitionId,
        )

        // Kollision: wettkampfweite Typ-Zuordnung UND angewähltes Rennen.
        exec(
            conn,
            "insert into ready2race.competition (id, event, created_at, updated_at, raceclocker_race) values (?, ?, now(), now(), ?)",
            collisionCompetitionId, eventId, raceId,
        )
        exec(
            conn,
            "insert into ready2race.competition_properties (id, competition, identifier, name) values (?, ?, 'K1', 'Kollision')",
            UUID.randomUUID(), collisionCompetitionId,
        )
        exec(
            conn,
            "insert into ready2race.timing_mode_assignment (id, competition, competition_setup_round, timing_mode, created_at, updated_at) " +
                "values (?, ?, null, ?, now(), now())",
            UUID.randomUUID(), collisionCompetitionId, modeId,
        )

        // Sauber: nur das Rennen, keine eigene Konfiguration.
        exec(
            conn,
            "insert into ready2race.competition (id, event, created_at, updated_at, raceclocker_race) values (?, ?, now(), now(), ?)",
            cleanCompetitionId, eventId, raceId,
        )
        exec(
            conn,
            "insert into ready2race.competition_properties (id, competition, identifier, name) values (?, ?, 'S1', 'Sauber')",
            UUID.randomUUID(), cleanCompetitionId,
        )
    }

    private fun exec(conn: Connection, sql: String, vararg args: Any?) =
        conn.prepareStatement(sql).use { stmt ->
            args.forEachIndexed { index, value -> stmt.setObject(index + 1, value) }
            stmt.executeUpdate()
        }
}
