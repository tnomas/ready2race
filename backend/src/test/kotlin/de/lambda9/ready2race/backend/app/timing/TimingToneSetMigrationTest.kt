package de.lambda9.ready2race.backend.app.timing

import org.flywaydb.core.Flyway
import org.testcontainers.containers.PostgreSQLContainer
import java.sql.Connection
import java.sql.DriverManager
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Die Migration V202608261200 gegen echte Altdaten — der wichtigste Test dieser Arbeit.
 *
 * Sie zieht die vier Töne einer Zeitnahme in benannte Sätze an der Veranstaltung zusammen. Das ist
 * heikel, weil sie heute an ZWEI Stellen liegen: der Startsequenz-Tonplan am Zeitnahmetyp, die
 * übrigen drei an der Veranstaltung. Ein einziger Satz je Veranstaltung könnte verschiedene
 * Tonpläne nicht abbilden — deshalb die Regel „ein Vorgabesatz plus je ein eigener Satz für jeden
 * Typ mit eigenem Plan", und deshalb dieser Test: Er belegt, dass nach der Migration keine Regatta
 * anders klingt als vorher. Einen Rollback ohne Dump gibt es nicht.
 *
 * Eigener Container wie bei [de.lambda9.ready2race.backend.app.timingProfile.TimingProfileMigrationTest]:
 * Der übliche Testcontainer migriert immer bis zum Ende, und über einer leeren Datenbank gäbe es
 * nichts zu überführen.
 *
 * Migriert wird bis zum Ende, mit den Standard-Callbacks — dadurch läuft auch `afterMigrate.sql`.
 * Das ist Absicht: Führte irgendeine Sicht `timing_mode.tone_plan`, scheiterte das Ablegen der
 * Spalte genau hier, statt erst auf einer echten Datenbank.
 */
class TimingToneSetMigrationTest {

    /** Die Regatta mit Tönen: eigene Erfassungs-, Fehlstart- und Zieltöne an der Veranstaltung. */
    private val eventId = UUID.randomUUID()

    /** Zeitnahmetyp MIT eigenem Tonplan — bekommt seinen eigenen Satz. */
    private val modeWithPlanId = UUID.randomUUID()

    /** Zeitnahmetyp OHNE eigenen Tonplan — bleibt auf null und erbt „Standard". */
    private val modeWithoutPlanId = UUID.randomUUID()

    /**
     * Veranstaltung ohne Zeitnahmetypen, aber MIT eigenen Tönen — sie bekommt trotzdem einen
     * Vorgabesatz. Ihre drei Töne wirken heute unabhängig von Typen (GET /timing/settings), sie
     * verlöre sie also ersatzlos, wenn die Spalten fallen.
     */
    private val eventTonesOnlyId = UUID.randomUUID()

    /** Veranstaltung ohne Typen UND ohne eigene Töne — hier gibt es nichts zu bewahren. */
    private val eventEmptyId = UUID.randomUUID()

    /** Zwei Typen mit DEMSELBEN Tonplan — jeder bekommt seinen eigenen Satz. */
    private val eventSamePlanId = UUID.randomUUID()
    private val samePlanFirstId = UUID.randomUUID()
    private val samePlanSecondId = UUID.randomUUID()

    /** Veranstaltung, deren Zeitnahmetyp selbst „Standard" heißt — die Namenskollision. */
    private val eventCollisionId = UUID.randomUUID()
    private val collidingModeId = UUID.randomUUID()

    /** Veranstaltung ohne jeden eigenen Ton, deren Typ dennoch einen Tonplan trägt. */
    private val eventSilentId = UUID.randomUUID()
    private val silentModeId = UUID.randomUUID()

    private val splitTone = """{"frequencyHz": 660, "durationMillis": 120}"""
    private val finishTone = """{"frequencyHz": 990, "durationMillis": 200}"""
    private val falseStartTone = """[{"offsetMillis": 0, "frequencyHz": 200, "durationMillis": 300}]"""
    private val tonePlan =
        """[{"offsetMillis": -3000, "frequencyHz": 600, "durationMillis": 100}, {"offsetMillis": 0, "frequencyHz": 900, "durationMillis": 400}]"""

    @Test
    fun `überführt die Töne in Sätze, ohne dass eine Regatta anders klingt`() {
        val postgres = PostgreSQLContainer("postgres:17")
        postgres.start()
        try {
            // Der letzte Stand vor der neuen Migration.
            flyway(postgres).target("202608251300").skipDefaultCallbacks(true).load().migrate()

            // Der Tonplan, wie ihn die Datenbank normalisiert speichert — das ist der Wert, den
            // der neue Satz Zeichen für Zeichen tragen muss.
            val storedPlan = connect(postgres).use { conn ->
                seedLegacyState(conn)
                queryString(conn, "select tone_plan::text from ready2race.timing_mode where id = ?", modeWithPlanId)
            }
            assertNotNull(storedPlan)

            flyway(postgres).load().migrate()

            connect(postgres).use { conn ->
                // Fall 1: zwei Typen, einer mit und einer ohne eigenen Plan -> zwei Sätze.
                assertEquals(2, count(conn, "select count(*) from ready2race.timing_tone_set where event = ?", eventId))

                // Der Typ ohne eigenen Plan bleibt auf null und erbt damit den Vorgabesatz.
                assertNull(queryUuid(conn, "select tone_set from ready2race.timing_mode where id = ?", modeWithoutPlanId))

                // Der Typ mit eigenem Plan zeigt auf einen Satz, der nach ihm heißt ...
                val ownSetId = queryUuid(conn, "select tone_set from ready2race.timing_mode where id = ?", modeWithPlanId)
                assertNotNull(ownSetId)
                assertEquals("Wellenstart", queryString(conn, "select name from ready2race.timing_tone_set where id = ?", ownSetId))
                // ... und der trägt seinen alten Tonplan unverändert.
                assertEquals(storedPlan, queryString(conn, "select sequence_tone_plan::text from ready2race.timing_tone_set where id = ?", ownSetId))
                // Der eigene Satz ist NICHT die Vorgabe — die bleibt „Standard".
                assertFalse(queryBoolean(conn, "select is_default from ready2race.timing_tone_set where id = ?", ownSetId))
                // Und er trägt dieselben drei Veranstaltungs-Töne wie der Vorgabesatz: der Typ
                // klingt an Zwischenzeit, Fehlstart und Ziel weiter wie die ganze Regatta.
                assertTrue(carriesEventTones(conn, ownSetId))

                // Fall 2: Der Vorgabesatz trägt die drei Töne der Veranstaltung unverändert und
                // hat keinen eigenen Startplan — genau die heutige Bedeutung „eingebauter Plan".
                val defaultSetId = defaultSetOf(conn, eventId)
                assertNotNull(defaultSetId)
                assertEquals("Standard", queryString(conn, "select name from ready2race.timing_tone_set where id = ?", defaultSetId))
                assertNull(queryString(conn, "select sequence_tone_plan::text from ready2race.timing_tone_set where id = ?", defaultSetId))
                assertTrue(carriesEventTones(conn, defaultSetId))

                // Fall 3: Eine Veranstaltung OHNE Zeitnahmetypen, aber mit eigenen Tönen bekommt
                // trotzdem ihren Vorgabesatz — und der trägt genau ihre Töne. Ohne ihn verlöre
                // gerade diese Regatta ihren Zielton, sobald die Veranstaltungs-Spalten fallen.
                assertEquals(
                    1,
                    count(conn, "select count(*) from ready2race.timing_tone_set where event = ?", eventTonesOnlyId),
                )
                val tonesOnlySetId = defaultSetOf(conn, eventTonesOnlyId)
                assertNotNull(tonesOnlySetId)
                assertTrue(carriesEventTones(conn, tonesOnlySetId))

                // Erst ohne Typen UND ohne Töne bleibt es leer — dort gäbe es nichts zu bewahren.
                assertEquals(
                    0,
                    count(conn, "select count(*) from ready2race.timing_tone_set where event = ?", eventEmptyId),
                )

                // Fall 4: Genau ein Vorgabesatz je Veranstaltung — über den ganzen Bestand.
                assertEquals(
                    0,
                    count(
                        conn,
                        "select count(*) from (select event from ready2race.timing_tone_set " +
                            "where is_default group by event having count(*) > 1) doppelte",
                    ),
                )

                // Namenskollision: Heißt der Typ selbst „Standard", weicht sein Satz aus — beide
                // Sätze existieren, der Typ zeigt auf den ausgewichenen, und der Vorgabesatz
                // behält den Namen „Standard".
                assertEquals(
                    2,
                    count(conn, "select count(*) from ready2race.timing_tone_set where event = ?", eventCollisionId),
                )
                val collidingSetId = queryUuid(conn, "select tone_set from ready2race.timing_mode where id = ?", collidingModeId)
                assertNotNull(collidingSetId)
                assertEquals(
                    "Standard (Zeitnahmetyp)",
                    queryString(conn, "select name from ready2race.timing_tone_set where id = ?", collidingSetId),
                )
                assertEquals("Standard", queryString(conn, "select name from ready2race.timing_tone_set where id = ?", defaultSetOf(conn, eventCollisionId)!!))

                // Ein Typ ohne jeden Ton an seiner Veranstaltung: sein Satz trägt den Plan und
                // sonst nichts — null bleibt null und heißt weiter „eingebauter Standard".
                val silentSetId = queryUuid(conn, "select tone_set from ready2race.timing_mode where id = ?", silentModeId)
                assertNotNull(silentSetId)
                assertEquals(
                    1,
                    count(
                        conn,
                        "select count(*) from ready2race.timing_tone_set where id = ? and split_tone is null " +
                            "and false_start_tone is null and finish_tone is null and sequence_tone_plan is not null",
                        silentSetId,
                    ),
                )

                // Zwei Typen mit DEMSELBEN Tonplan: Der Plan ist kein Schlüssel — jeder Typ
                // bekommt seinen eigenen, nach ihm benannten Satz, und beide tragen den Plan.
                // Ein Satz für beide wäre bequem und würde beim ersten Umstellen eines der beiden
                // Typen still auch den anderen umstellen.
                assertEquals(
                    3,
                    count(conn, "select count(*) from ready2race.timing_tone_set where event = ?", eventSamePlanId),
                )
                val ersterSatz = queryUuid(conn, "select tone_set from ready2race.timing_mode where id = ?", samePlanFirstId)
                val zweiterSatz = queryUuid(conn, "select tone_set from ready2race.timing_mode where id = ?", samePlanSecondId)
                assertNotNull(ersterSatz)
                assertNotNull(zweiterSatz)
                assertNotEquals(ersterSatz, zweiterSatz)
                assertEquals("Vorlauf", queryString(conn, "select name from ready2race.timing_tone_set where id = ?", ersterSatz))
                assertEquals("Endlauf", queryString(conn, "select name from ready2race.timing_tone_set where id = ?", zweiterSatz))
                assertEquals(storedPlan, queryString(conn, "select sequence_tone_plan::text from ready2race.timing_tone_set where id = ?", ersterSatz))
                assertEquals(storedPlan, queryString(conn, "select sequence_tone_plan::text from ready2race.timing_tone_set where id = ?", zweiterSatz))

                // Die Tonleiter je Boot ist für den GANZEN Bestand aus: Der Spaltenstandard `true`
                // ist für neue Sätze richtig, für migrierte wäre er ein Klangwechsel — heute gibt
                // es keine Tonleiter je Boot, und die Migration darf keine einführen.
                assertEquals(
                    0,
                    count(conn, "select count(*) from ready2race.timing_tone_set where tone_per_boat"),
                )

                // Der Tonplan am Typ ist wirklich fort — und die neuen Spalten stehen mit ihren
                // Vorgaben da, damit kein bestehender Typ ohne Startsequenz oder ohne Tasten
                // dasteht. Gezählt wird eventweise: Eine Zählung über die ganze Datenbank ginge
                // auch dann auf, wenn ein Typ dieser Veranstaltung fehlte und einer woanders
                // dazukäme.
                assertFalse(columnExists(conn, "timing_mode", "tone_plan"))
                assertEquals(
                    2,
                    count(
                        conn,
                        "select count(*) from ready2race.timing_mode where event = ? " +
                            "and start_sequence_enabled and boat_keys_primary = '123456' " +
                            "and boat_keys_secondary = 'ABCDEF'",
                        eventId,
                    ),
                )
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
        insertEvent(conn, eventId, "Testregatta", splitTone, falseStartTone, finishTone)
        insertMode(conn, modeWithPlanId, eventId, "Wellenstart", tonePlan)
        insertMode(conn, modeWithoutPlanId, eventId, "Massenstart", null)

        // Ohne Zeitnahmetypen, aber mit eigenen Tönen: Der Satz muss trotzdem entstehen.
        insertEvent(conn, eventTonesOnlyId, "Regatta ohne Zeitnahmetypen", splitTone, falseStartTone, finishTone)

        // Weder Typen noch Töne: Hier ist ein Satz nur Ballast.
        insertEvent(conn, eventEmptyId, "Regatta ohne alles", null, null, null)

        // Zwei Typen, EIN Tonplan: Der Plan ist kein Schlüssel, jeder Typ bekommt seinen Satz.
        insertEvent(conn, eventSamePlanId, "Regatta mit zwei gleichen Plänen", splitTone, falseStartTone, finishTone)
        insertMode(conn, samePlanFirstId, eventSamePlanId, "Vorlauf", tonePlan)
        insertMode(conn, samePlanSecondId, eventSamePlanId, "Endlauf", tonePlan)

        insertEvent(conn, eventCollisionId, "Regatta mit Namenskollision", splitTone, falseStartTone, finishTone)
        insertMode(conn, collidingModeId, eventCollisionId, "Standard", tonePlan)

        insertEvent(conn, eventSilentId, "Regatta ohne eigene Töne", null, null, null)
        insertMode(conn, silentModeId, eventSilentId, "Timetrial 30s", tonePlan)
    }

    private fun insertEvent(
        conn: Connection,
        id: UUID,
        name: String,
        splitTone: String?,
        falseStartTone: String?,
        finishTone: String?,
    ) = exec(
        conn,
        "insert into ready2race.event (id, name, created_at, updated_at, timing_system, " +
            "timing_split_tone, timing_false_start_tone, timing_finish_tone) " +
            "values (?, ?, now(), now(), 'INTERN', ?::jsonb, ?::jsonb, ?::jsonb)",
        id, name, splitTone, falseStartTone, finishTone,
    )

    private fun insertMode(conn: Connection, id: UUID, event: UUID, name: String, tonePlan: String?) = exec(
        conn,
        "insert into ready2race.timing_mode (id, event, name, start_grouping, lead_in_seconds, " +
            "tone_plan, created_at, updated_at) values (?, ?, ?, 'WELLE', 10, ?::jsonb, now(), now())",
        id, event, name, tonePlan,
    )

    /** Trägt der Satz die drei Töne SEINER Veranstaltung Zeichen für Zeichen? */
    private fun carriesEventTones(conn: Connection, setId: UUID): Boolean = count(
        conn,
        "select count(*) from ready2race.timing_tone_set s join ready2race.event e on e.id = s.event " +
            "where s.id = ? and s.split_tone is not distinct from e.timing_split_tone " +
            "and s.false_start_tone is not distinct from e.timing_false_start_tone " +
            "and s.finish_tone is not distinct from e.timing_finish_tone",
        setId,
    ) == 1

    private fun defaultSetOf(conn: Connection, event: UUID): UUID? =
        queryUuid(conn, "select id from ready2race.timing_tone_set where event = ? and is_default", event)

    private fun exec(conn: Connection, sql: String, vararg args: Any?) =
        conn.prepareStatement(sql).use { stmt ->
            args.forEachIndexed { index, value -> stmt.setObject(index + 1, value) }
            stmt.executeUpdate()
        }

    private fun queryUuid(conn: Connection, sql: String, vararg args: Any?): UUID? =
        query(conn, sql, args) { it.getObject(1, UUID::class.java) }

    private fun queryString(conn: Connection, sql: String, vararg args: Any?): String? =
        query(conn, sql, args) { it.getString(1) }

    private fun queryBoolean(conn: Connection, sql: String, vararg args: Any?): Boolean =
        query(conn, sql, args) { it.getBoolean(1) } ?: false

    private fun count(conn: Connection, sql: String, vararg args: Any?): Int =
        query(conn, sql, args) { it.getInt(1) } ?: 0

    private fun <T> query(conn: Connection, sql: String, args: Array<out Any?>, read: (java.sql.ResultSet) -> T): T? =
        conn.prepareStatement(sql).use { stmt ->
            args.forEachIndexed { index, value -> stmt.setObject(index + 1, value) }
            stmt.executeQuery().use { rs -> if (rs.next()) read(rs) else null }
        }

    private fun columnExists(conn: Connection, table: String, column: String): Boolean =
        query(
            conn,
            "select exists (select 1 from information_schema.columns " +
                "where table_schema = 'ready2race' and table_name = ? and column_name = ?)",
            arrayOf(table, column),
        ) { it.getBoolean(1) } ?: false
}
