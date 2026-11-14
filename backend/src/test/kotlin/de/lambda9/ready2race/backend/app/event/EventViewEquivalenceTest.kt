package de.lambda9.ready2race.backend.app.event

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.timing.createTestEventWithAdmin
import de.lambda9.ready2race.backend.app.timing.createTestMatchFixture
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.orDie
import de.lambda9.tailwind.jooq.Jooq
import de.lambda9.ready2race.testing.testComprehension
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * event_view wurde von einem Verbund-Fächer (Wettkämpfe x Tage x Meldungen) auf Unterabfragen
 * umgestellt. Die neue Fassung muss Zeile für Zeile dasselbe liefern wie die alte, die hier als
 * Referenz steht.
 */
class EventViewEquivalenceTest {

    private val legacyEventView = """
            select e.id,
                   e.name,
                   e.description,
                   e.location,
                   e.registration_available_from,
                   e.registration_available_to,
                   e.late_registration_available_to,
                   e.invoice_prefix,
                   e.published,
                   e.invoices_produced,
                   e.late_invoices_produced,
                   e.payment_due_by,
                   e.late_payment_due_by,
                   exists (select 1
                           from competition_registration cr
                                    join competition c2 on cr.competition = c2.id
                           where c2.event = e.id
                             and cr.is_late is true)                                                as has_late_registrations,
                   e.mixed_team_term,
                   e.challenge_event,
                   e.challenge_match_result_type,
                   e.self_submission,
                   e.submission_needs_verification,
                   e.participant_self_registration,
                   e.chain_progression_mode,
                   e.auto_create_following_rounds,
                   e.show_breaks_on_public_boards,
                   e.public_results_visibility,
                   e.execution_auto_refresh,
                   e.execution_auto_refresh_seconds,
                   e.cross_club_registration,
                   e.notice_text,
                   e.notice_severity,
                   e.team_numbers_as_start_numbers,
                   coalesce(array_agg(distinct er.club) filter ( where er.club is not null ), '{}') as registered_clubs,
                   max(cpcc.end_at)                                                                 as challenge_end,
                   err.event is not null                                                            as registrations_finalized,
                   min(coalesce(ed.operations_start, ed.date::timestamp))                           as operations_start,
                   min(ed.date)                                                                     as first_event_day,
                   max(ed.date)                                                                     as last_event_day
            from event e
                     left join competition c on e.id = c.event
                     left join competition_properties cp on c.id = cp.competition
                     left join competition_properties_challenge_config cpcc on cp.id = cpcc.competition_properties
                     left join event_day ed on e.id = ed.event
                     left join event_registration er on e.id = er.event
                     left join event_registration_report err on e.id = err.event
            group by e.id, e.name, e.description, e.location, e.registration_available_from, e.registration_available_to,
                     e.created_at, err.event
    """.trimIndent()

    private fun exec(sql: String): App<Nothing, Unit> = Jooq.query { execute(sql); Unit }.orDie()

    private fun seedRichEvent(): App<Any?, UUID> = KIO.comprehension {
        val (eventId, _) = !createTestEventWithAdmin()
        val fixtures = listOf(
            !createTestMatchFixture(eventId, teamCount = 2),
            !createTestMatchFixture(eventId, teamCount = 1),
            !createTestMatchFixture(eventId, teamCount = 3),
        )
        // Zwei Renntage, einer mit Betriebsbeginn.
        !exec(
            """
            insert into event_day (id, event, date, created_at, updated_at, operations_start)
            values (gen_random_uuid(), '$eventId', date '2026-08-14', now(), now(), timestamp '2026-08-14 07:30'),
                   (gen_random_uuid(), '$eventId', date '2026-08-15', now(), now(), null)
            """
        )
        // Challenge-Konfiguration an zwei Wettkämpfen mit unterschiedlichem Ende.
        !exec(
            """
            insert into competition_properties_challenge_config (competition_properties, start_at, end_at)
            values ('${fixtures[0].competitionPropertiesId}', timestamp '2026-08-01 00:00', timestamp '2026-08-10 12:00'),
                   ('${fixtures[1].competitionPropertiesId}', timestamp '2026-08-01 00:00', timestamp '2026-08-12 18:00')
            """
        )
        // Eine Nachmeldung und ein Meldeschluss-Bericht.
        !exec(
            """
            update competition_registration set is_late = true
            where id = (select id from competition_registration where competition = '${fixtures[2].competitionId}' limit 1)
            """
        )
        !exec("insert into event_registration_report (event, name, created_at) values ('$eventId', 'bericht.pdf', now())")
        KIO.ok(eventId)
    }

    @Test
    fun `neue event_view liefert dieselben Zeilen wie die alte`() = testComprehension {
        val rich = !seedRichEvent()
        val (empty, _) = !createTestEventWithAdmin()

        val onlyLegacy = !Jooq.query {
            fetchValue("select count(*) from ((${legacyEventView}) except all (select * from event_view)) d") as Long
        }.orDie()
        val onlyNew = !Jooq.query {
            fetchValue("select count(*) from ((select * from event_view) except all (${legacyEventView})) d") as Long
        }.orDie()
        assertEquals(0L, onlyLegacy, "Zeilen nur in der alten Fassung")
        assertEquals(0L, onlyNew, "Zeilen nur in der neuen Fassung")

        // Und die Werte stimmen inhaltlich (nicht nur gleich falsch).
        val row = !Jooq.query {
            fetchOne(
                "select has_late_registrations, cardinality(registered_clubs), challenge_end::text, " +
                    "registrations_finalized, operations_start::text, first_event_day::text, last_event_day::text " +
                    "from event_view where id = '$rich'"
            )!!
        }.orDie()
        assertEquals(true, row.get(0))
        assertEquals(3, row.get(1))
        assertEquals("2026-08-12 18:00:00", row.get(2))
        assertEquals(true, row.get(3))
        assertEquals("2026-08-14 07:30:00", row.get(4))
        assertEquals("2026-08-14", row.get(5))
        assertEquals("2026-08-15", row.get(6))

        val emptyRow = !Jooq.query {
            fetchOne("select has_late_registrations, cardinality(registered_clubs), registrations_finalized, first_event_day from event_view where id = '$empty'")!!
        }.orDie()
        assertEquals(false, emptyRow.get(0))
        assertEquals(0, emptyRow.get(1))
        assertEquals(false, emptyRow.get(2))
        assertEquals(null, emptyRow.get(3))
    }
}
