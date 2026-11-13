package de.lambda9.ready2race.backend.database

import de.lambda9.ready2race.testing.testComprehension
import de.lambda9.tailwind.jooq.Jooq
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Indizes, die heiße Abfragen tragen, und solche, die nur Schreibkosten erzeugen. Geprüft wird das
 * migrierte Schema, nicht der Migrationstext.
 */
class SchemaIndexTest {

    private data class Index(val table: String, val name: String, val definition: String)

    private fun indexes() = Jooq.query {
        resultQuery(
            """
            select tablename, indexname, indexdef
            from pg_indexes
            where schemaname = 'ready2race'
            """.trimIndent()
        ).fetch { Index(it.get(0, String::class.java), it.get(1, String::class.java), it.get(2, String::class.java)) }
    }

    /** Spaltenliste samt Prädikat, ohne Indexname - so lassen sich Duplikate erkennen. */
    private fun Index.shape() = definition
        .substringAfter(" ON ")
        .replace(Regex("\\s+"), " ")

    private fun List<Index>.hasIndexOn(table: String, columnsAndPredicate: String) =
        any { it.table == table && it.shape().endsWith(columnsAndPredicate) }

    @Test
    fun `Fremdschluessel der Durchfuehrung mit heissen Abfragen sind indiziert`() = testComprehension {
        val all = !indexes()
        assertTrue(all.hasIndexOn("competition_match_team", "(competition_registration)"), "competition_match_team.competition_registration")
        assertTrue(all.hasIndexOn("substitution", "(competition_registration)"), "substitution.competition_registration")
        assertTrue(all.hasIndexOn("substitution", "(participant_in)"), "substitution.participant_in")
    }

    @Test
    fun `offene Mails und Anhaenge je Mail sind indiziert`() = testComprehension {
        val all = !indexes()
        assertTrue(
            all.hasIndexOn("email", "(priority DESC, created_at) WHERE (sent_at IS NULL)"),
            all.filter { it.table == "email" }.joinToString("\n") { it.definition },
        )
        assertTrue(all.hasIndexOn("email_attachment", "(email)"), "email_attachment.email")
    }

    @Test
    fun `keine zwei Indizes mit gleicher Definition auf derselben Tabelle`() = testComprehension {
        val duplicates = (!indexes())
            .groupBy { it.table to it.shape().substringAfter(" USING ") }
            .filterValues { it.size > 1 }
            .map { (_, idx) -> idx.joinToString(" = ") { it.name } }
        assertEquals(emptyList(), duplicates)
    }

    @Test
    fun `durch eindeutige Mehrspalten-Indizes abgedeckte Einspalten-Indizes sind entfernt`() = testComprehension {
        val names = (!indexes()).map { it.name }.toSet()
        listOf(
            "competition_match_team_competition_match_idx",
            "event_registration_event_idx",
            "competition_registration_competition_idx",
            "idx_timing_sequence_entry_seq",
        ).forEach { assertTrue(it !in names, "$it ist noch vorhanden") }

        // Die abdeckenden Indizes müssen dafür bleiben.
        listOf(
            "starting_position_unique_in_match",
            "event_registration_unique_for_club",
            "competition_registration_competition_club_name_key",
            "timing_start_sequence_entry_sequence_position_key",
        ).forEach { assertTrue(it in names, "$it fehlt") }
    }
}
