package de.lambda9.ready2race.backend.app.invoice

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.invoice.boundary.InvoiceService
import de.lambda9.ready2race.backend.app.invoice.control.ProduceInvoiceForRegistrationRepo
import de.lambda9.ready2race.backend.app.invoice.entity.ProduceInvoiceError
import de.lambda9.ready2race.backend.app.timing.createTestEventWithAdmin
import de.lambda9.ready2race.backend.app.timing.createTestMatchTeams
import de.lambda9.ready2race.backend.database.generated.tables.records.ProduceInvoiceForRegistrationRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.EVENT_REGISTRATION
import de.lambda9.ready2race.backend.database.generated.tables.references.PRODUCE_INVOICE_FOR_REGISTRATION
import de.lambda9.ready2race.testing.ConcurrentTx
import de.lambda9.ready2race.testing.testCommittingComprehension
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.KIO.Companion.unsafeRunSync
import de.lambda9.tailwind.core.extensions.exit.fold
import de.lambda9.tailwind.core.extensions.kio.orDie
import de.lambda9.tailwind.jooq.Jooq
import de.lambda9.tailwind.jooq.transact
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.fail
import kotlin.time.Duration.Companion.minutes

/**
 * Rechnungsjob und Sperre. Die ersten beiden Tests belegen die Mechanik, an der der Job früher
 * hing: so, wie der Scheduler ihn rief - ohne umgebende Transaktion -, hält `FOR UPDATE SKIP
 * LOCKED` nichts, und ein Löschen auf dem außerhalb geholten Datensatz committet unabhängig von der
 * inneren Transaktion. Der dritte sichert den heutigen Ablauf (alles in einer Transaktion).
 */
class InvoiceJobLockTest {

    internal fun seedJob(): App<Any?, UUID> = KIO.comprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !createTestMatchTeams(eventId, 1)
        val registrationId = !Jooq.query {
            select(EVENT_REGISTRATION.ID).from(EVENT_REGISTRATION).where(EVENT_REGISTRATION.EVENT.eq(eventId)).fetchOne(EVENT_REGISTRATION.ID)!!
        }.orDie()
        val jobId = UUID.randomUUID()
        !ProduceInvoiceForRegistrationRepo.create(
            listOf(
                ProduceInvoiceForRegistrationRecord(
                    id = jobId,
                    mode = "REGULAR",
                    eventRegistration = registrationId,
                    contactName = "A", contactEmail = "a@example.com", contactAddressZip = "1",
                    contactAddressCity = "B", contactAddressStreet = "C",
                    payeeHolder = "H", payeeIban = "DE02120300000000202051", payeeBic = "BYLADEM1001", payeeBank = "Bank",
                    createdAt = LocalDateTime.now(), createdBy = userId,
                )
            )
        ).orDie()
        KIO.ok(jobId)
    }

    @Test
    fun lockTakenWithoutTransactionDoesNotHold() = testCommittingComprehension {
        val jobId = !seedJob()

        // Wie der Scheduler: kein .transact() - Autocommit gibt die Sperre sofort wieder frei.
        val first = ProduceInvoiceForRegistrationRepo.getAndLockNext(5.minutes).orDie().unsafeRunSync(env)
            .fold(onSuccess = { it }, onError = { null }, onDefect = { throw it })
        val second = !ProduceInvoiceForRegistrationRepo.getAndLockNext(5.minutes).orDie().transact()

        assertEquals(jobId, first!!.id)
        assertEquals(jobId, second?.id, "eine zweite Instanz bekommt denselben Job")
    }

    @Test
    fun deleteOnRecordFetchedOutsideCommitsDespiteRollback() = testCommittingComprehension {
        val jobId = !seedJob()
        val job = ProduceInvoiceForRegistrationRepo.getAndLockNext(5.minutes).orDie().unsafeRunSync(env)
            .fold(onSuccess = { it!! }, onError = { error("") }, onDefect = { throw it })

        val failing: App<String, Unit> = KIO.comprehension {
            job.delete()
            KIO.fail("später gescheitert")
        }
        failing.transact().unsafeRunSync(env)

        val remaining = !Jooq.query { fetchCount(PRODUCE_INVOICE_FOR_REGISTRATION, PRODUCE_INVOICE_FOR_REGISTRATION.ID.eq(jobId)) }.orDie()
        assertEquals(0, remaining, "die Löschung hat den Rollback überlebt")
    }

    @Test
    fun concurrentJobRunsProcessAJobOnlyOnce() = testCommittingComprehension {
        val jobId = !seedJob()

        val (a, b) = ConcurrentTx.runHoldingFirst(
            env,
            first = InvoiceService.processNextRegistrationInvoiceJob(),
            second = InvoiceService.processNextRegistrationInvoiceJob(),
        )

        // Die geseedete Meldung hat keine Gebühren: A erledigt den Job über "keine Positionen".
        a.fold(onSuccess = { assertEquals(ProduceInvoiceError.NoPositions, it) }, onError = { fail("$it") }, onDefect = { throw it })
        // B läuft, während A die Sperre hält: SKIP LOCKED überspringt den Job.
        b.fold(onSuccess = { assertEquals(ProduceInvoiceError.NoOpenJobs, it) }, onError = { fail("$it") }, onDefect = { throw it })
        val remaining = !Jooq.query { fetchCount(PRODUCE_INVOICE_FOR_REGISTRATION, PRODUCE_INVOICE_FOR_REGISTRATION.ID.eq(jobId)) }.orDie()
        assertEquals(0, remaining)
    }
}
