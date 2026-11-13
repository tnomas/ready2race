package de.lambda9.ready2race.backend.pagination

import de.lambda9.ready2race.backend.app.club.control.ClubRepo
import de.lambda9.ready2race.backend.app.club.entity.ClubSort
import de.lambda9.ready2race.backend.database.generated.tables.references.CLUB
import de.lambda9.ready2race.backend.database.generated.tables.references.EVENT_VIEW
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_DEREGISTRATION
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_REGISTRATION
import de.lambda9.ready2race.backend.database.generated.tables.records.ClubRecord
import de.lambda9.ready2race.backend.database.page
import de.lambda9.ready2race.testing.testComprehension
import org.jooq.SQLDialect
import org.jooq.impl.DSL
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** Seiten haben eine eindeutige Sortierung: ohne sie gehen Zeilen zwischen zwei Seiten verloren. */
@Suppress("DEPRECATION")
class StableOrderTest {

    private val dsl = DSL.using(SQLDialect.POSTGRES)

    private fun byName() = PaginationParameters<ClubSort>(
        limit = 10, offset = 0, sort = listOf(Order(ClubSort.NAME, Direction.ASC)), search = null,
    )

    @Test
    fun `Tabelle bekommt ihren Primaerschluessel als letzten Sortierschluessel`() {
        val sql = dsl.selectFrom(CLUB).page(byName()).sql
        assertTrue(Regex("""order by .*"name" asc, .*"club"\."id" asc""").containsMatchIn(sql), sql)
    }

    @Test
    fun `ohne Sortierwunsch wird trotzdem eindeutig sortiert`() {
        val sql = dsl.selectFrom(CLUB).page(byName().copy(sort = null)).sql
        assertTrue(Regex("""order by .*"club"\."id" asc""").containsMatchIn(sql), sql)
    }

    @Test
    fun `View ohne Primaerschluessel nimmt die Spalte id`() {
        val sql = dsl.selectFrom(EVENT_VIEW).page(PaginationParameters<ClubSort>(10, 0, null, null)).sql
        assertTrue(Regex("""order by .*"event_view"\."id" asc""").containsMatchIn(sql), sql)
    }

    @Test
    fun `bei einem Verbund zaehlt die linke Tabelle`() {
        val sql = dsl.select().from(COMPETITION_REGISTRATION)
            .leftJoin(COMPETITION_DEREGISTRATION)
            .on(COMPETITION_REGISTRATION.ID.eq(COMPETITION_DEREGISTRATION.COMPETITION_REGISTRATION))
            .page(PaginationParameters<ClubSort>(10, 0, null, null)).sql
        assertTrue(Regex("""order by .*"competition_registration"\."id" asc""").containsMatchIn(sql), sql)
    }

    @Test
    fun `gewaehlter Schluessel wird nicht doppelt angehaengt`() {
        val params = byName().copy(sort = listOf(Order(ClubSort.ID, Direction.DESC)))
        val sql = dsl.selectFrom(CLUB).page(params).sql
        assertEquals(1, Regex(""""club"\."id"""").findAll(sql.substringAfter("order by")).count(), sql)
    }

    @Test
    fun `alle Seiten zusammen enthalten jeden gleichzeitig angelegten Verein genau einmal`() = testComprehension {
        val now = LocalDateTime.now()
        val ids = (1..25).map { UUID.randomUUID() }
        // Namen sind eindeutig; gleich ist der Anlagezeitpunkt, nach dem sortiert wird.
        ids.forEachIndexed { i, id ->
            !ClubRepo.create(ClubRecord(id = id, name = "Gleichzeitig $i", createdAt = now, updatedAt = now))
        }
        val seen = (0 until 3).flatMap { pageNo ->
            val params = byName().copy(
                offset = pageNo * 10,
                search = "Gleichzeitig",
                sort = listOf(Order(ClubSort.CREATED_AT, Direction.ASC)),
            )
            (!ClubRepo.page(params, null)).map { it.id }
        }
        assertEquals(25, seen.size)
        assertEquals(ids.toSet(), seen.toSet())
    }
}
