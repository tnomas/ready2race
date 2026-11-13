package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.timing.boundary.TimingSequenceService
import de.lambda9.ready2race.backend.app.timing.control.TimingSequenceEntryRepo
import de.lambda9.ready2race.backend.app.timing.control.TimingSequenceRepo
import de.lambda9.ready2race.backend.app.timing.entity.CreateSequenceRequest
import de.lambda9.ready2race.backend.app.timing.entity.SequenceEntryStatus
import de.lambda9.ready2race.backend.app.timing.entity.SequenceMode
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationType
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.testing.testCommittingComprehension
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.orDie
import de.lambda9.tailwind.jooq.Jooq
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Ein Defekt in einer Startsequenz darf die Startsequenzen der übrigen Veranstaltungen nicht
 * anhalten: der Sekunden-Job fährt jede Sequenz in ihrer eigenen Transaktion.
 */
class TimingSequenceIsolationTest {

    @Test
    fun aDefectInOneSequenceDoesNotStopTheOthers() = testCommittingComprehension {
        val broken = !runningDueSequence()
        val healthy = !runningDueSequence()

        // Simulierter Defekt: jede Startmarke am Posten der kaputten Sequenz scheitert in der
        // Datenbank (orDie -> Defekt), wie es ein verbogener Datensatz am Renntag täte.
        !Jooq.query {
            execute(
                """
                create function test_fail_mark() returns trigger as ${'$'}${'$'}
                begin
                    if new.station = '${broken.stationId}' then raise exception 'Testdefekt'; end if;
                    return new;
                end ${'$'}${'$'} language plpgsql
                """.trimIndent()
            )
            execute("create trigger test_fail_mark before insert on timing_time_mark for each row execute function test_fail_mark()")
        }.orDie()

        val result = TimingSequenceService.fireDueEntriesIsolated(env)

        assertEquals(listOf(healthy.sequenceId), result.changedSequences.map { it.id }.distinct())
        assertTrue(
            (!TimingSequenceEntryRepo.getBySequence(healthy.sequenceId).orDie())
                .all { it.status == SequenceEntryStatus.STARTED.name },
            "die gesunde Sequenz feuert trotz des Defekts nebenan",
        )
        assertTrue(
            (!TimingSequenceEntryRepo.getBySequence(broken.sequenceId).orDie())
                .all { it.status == SequenceEntryStatus.PENDING.name },
            "die kaputte Sequenz bleibt unverändert stehen (zurückgerollt)",
        )
    }

    private data class Running(val sequenceId: UUID, val stationId: UUID)

    /** Eigene Veranstaltung, Massenstart, Startzeit in der Vergangenheit - der nächste Tick feuert. */
    private fun runningDueSequence(): App<Any?, Running> = KIO.comprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val team = !createTestMatchTeam(eventId)
        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.MASS, null, listOf(team)),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id
        !TimingSequenceService.startSequence(sequenceId, userId, eventId)
        !TimingSequenceRepo.update(sequenceId) { startedAtMillis = System.currentTimeMillis() - 60_000 }.orDie()
        KIO.ok(Running(sequenceId, stationId))
    }
}
