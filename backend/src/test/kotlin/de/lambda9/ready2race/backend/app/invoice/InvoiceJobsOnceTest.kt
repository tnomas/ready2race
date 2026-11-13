package de.lambda9.ready2race.backend.app.invoice

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.invoice.boundary.InvoiceService
import de.lambda9.ready2race.backend.app.invoice.entity.InvoiceError
import de.lambda9.ready2race.backend.app.invoice.entity.ProduceInvoicesRequest
import de.lambda9.ready2race.backend.app.invoice.entity.RegistrationInvoiceType
import de.lambda9.ready2race.backend.app.timing.createTestEventWithAdmin
import de.lambda9.ready2race.backend.app.timing.createTestMatchTeams
import de.lambda9.ready2race.backend.database.generated.tables.records.BankAccountRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.ContactInformationRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.ContactInformationUsageRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.PayeeBankAccountRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.*
import de.lambda9.ready2race.testing.ConcurrentTx
import de.lambda9.ready2race.testing.testCommittingComprehension
import de.lambda9.ready2race.testing.testComprehension
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.exit.fold
import de.lambda9.tailwind.core.extensions.kio.orDie
import de.lambda9.tailwind.jooq.Jooq
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.fail

/**
 * Rechnungsjobs einer Veranstaltung entstehen genau einmal - auch bei Doppelklick oder zwei
 * Admins gleichzeitig. Sonst bekäme jeder Verein zwei Rechnungen mit zwei Nummern und zwei Mails.
 */
class InvoiceJobsOnceTest {

    /** Meldeschluss vorbei, Konto und Kontakt zugewiesen, zwei Meldungen mit regulären Wettkampfmeldungen. */
    private fun prepareInvoicableEvent(): App<Any?, Pair<UUID, UUID>> = KIO.comprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val now = LocalDateTime.now()
        !Jooq.query {
            update(EVENT).set(EVENT.REGISTRATION_AVAILABLE_TO, now.minusDays(1)).where(EVENT.ID.eq(eventId)).execute()

            val bankId = UUID.randomUUID()
            executeInsert(BankAccountRecord(bankId, "Ausrichter", "DE02120300000000202051", "BYLADEM1001", "Bank", now, userId, now, userId))
            executeInsert(PayeeBankAccountRecord(bankId, eventId, now, userId))
            val contactId = UUID.randomUUID()
            executeInsert(ContactInformationRecord(contactId, "Ausrichter", "24937", "Flensburg", "Hafen 1", "a@example.com", now, userId, now, userId))
            executeInsert(ContactInformationUsageRecord(contactId, eventId, now, userId))
        }.orDie()
        !createTestMatchTeams(eventId, 2)
        KIO.ok(eventId to userId)
    }

    private fun jobCount(eventId: UUID): App<Nothing, Int> = Jooq.query {
        fetchCount(
            selectFrom(PRODUCE_INVOICE_FOR_REGISTRATION)
                .where(
                    PRODUCE_INVOICE_FOR_REGISTRATION.EVENT_REGISTRATION.`in`(
                        select(EVENT_REGISTRATION.ID).from(EVENT_REGISTRATION).where(EVENT_REGISTRATION.EVENT.eq(eventId))
                    )
                )
        )
    }.orDie()

    private fun registrationCount(eventId: UUID): App<Nothing, Int> = Jooq.query {
        fetchCount(EVENT_REGISTRATION, EVENT_REGISTRATION.EVENT.eq(eventId))
    }.orDie()

    @Test
    fun secondCallInSequenceIsRejected() = testComprehension {
        val (eventId, userId) = !prepareInvoicableEvent()
        val request = ProduceInvoicesRequest(RegistrationInvoiceType.REGULAR)
        !InvoiceService.createRegistrationInvoicesForEventJobs(eventId, request, userId)
        assertKIOFails(InvoiceError.Registration.AlreadyProduced) {
            InvoiceService.createRegistrationInvoicesForEventJobs(eventId, request, userId)
        }
        assertEquals(!registrationCount(eventId), !jobCount(eventId))
    }

    @Test
    fun parallelCallsCreateJobsOnlyOnce() = testCommittingComprehension {
        val (eventId, userId) = !prepareInvoicableEvent()
        val request = ProduceInvoicesRequest(RegistrationInvoiceType.REGULAR)

        val (_, second) = ConcurrentTx.runHoldingFirst(
            env,
            first = InvoiceService.createRegistrationInvoicesForEventJobs(eventId, request, userId),
            second = InvoiceService.createRegistrationInvoicesForEventJobs(eventId, request, userId),
        )

        second.fold(
            onSuccess = { fail("Der zweite gleichzeitige Aufruf hätte abgewiesen werden müssen") },
            onError = { assertEquals(InvoiceError.Registration.AlreadyProduced, it) },
            onDefect = { fail("Der zweite Aufruf starb: $it") },
        )
        val registrations = !registrationCount(eventId)
        assertEquals(registrations, !jobCount(eventId))
    }
}
