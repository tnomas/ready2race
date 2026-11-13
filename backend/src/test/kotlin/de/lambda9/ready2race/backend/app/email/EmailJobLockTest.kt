package de.lambda9.ready2race.backend.app.email

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.email.boundary.EmailService
import de.lambda9.ready2race.backend.app.email.boundary.EmailService.SendOutcome
import de.lambda9.ready2race.backend.app.email.control.EmailRepo
import de.lambda9.ready2race.backend.app.email.entity.EmailError
import de.lambda9.ready2race.backend.config.Config
import de.lambda9.ready2race.backend.database.SYSTEM_USER
import de.lambda9.ready2race.backend.database.generated.tables.records.EmailRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.EMAIL
import de.lambda9.ready2race.testing.ConcurrentTx
import de.lambda9.ready2race.testing.testCommittingComprehension
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.KIO.Companion.unsafeRunSync
import de.lambda9.tailwind.core.extensions.exit.fold
import de.lambda9.tailwind.core.extensions.kio.orDie
import de.lambda9.tailwind.jooq.Jooq
import de.lambda9.tailwind.jooq.transact
import org.simplejavamail.api.mailer.config.TransportStrategy
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import kotlin.test.fail
import kotlin.time.Duration.Companion.minutes

/**
 * Versandjob und Sperre. Der erste Test belegt die Mechanik, an der der Job hing: so, wie der
 * Scheduler ihn rief - ohne umgebende Transaktion -, hält `FOR UPDATE SKIP LOCKED` nichts. Die
 * übrigen sichern den heutigen Ablauf.
 */
class EmailJobLockTest {

    /** Ein SMTP-Ziel, das nicht erreichbar ist (Port 1 auf localhost). */
    private val unreachableSmtp = Config.Smtp(
        host = "127.0.0.1",
        port = 1,
        user = "u",
        password = "p",
        strategy = TransportStrategy.SMTP,
        from = Config.Smtp.From(name = null, address = "absender@example.org"),
        replyTo = null,
        localhost = null,
    )

    private fun seedEmail(recipient: String): App<Any?, UUID> = KIO.comprehension {
        val now = LocalDateTime.now().minusSeconds(1)
        val id = UUID.randomUUID()
        !EmailRepo.create(
            EmailRecord(
                id = id,
                recipient = recipient,
                subject = "Probe",
                body = "Text",
                bodyIsHtml = false,
                priority = 1,
                dontSendBefore = now,
                keepAfterSending = 0,
                createdAt = now,
                createdBy = SYSTEM_USER,
                updatedAt = now,
                updatedBy = SYSTEM_USER,
            )
        ).orDie()
        KIO.ok(id)
    }

    private fun Config.skippingEveryone() = copy(mailReceiverWhitelist = listOf(Regex("^niemand$")))

    @Test
    fun lockTakenWithoutTransactionDoesNotHold() = testCommittingComprehension {
        val id = !seedEmail("a@example.org")

        val first = EmailRepo.getAndLockNext(5.minutes).orDie().unsafeRunSync(env)
            .fold(onSuccess = { it }, onError = { null }, onDefect = { throw it })
        val second = !EmailRepo.getAndLockNext(5.minutes).orDie().transact()

        assertEquals(id, first!!.id)
        assertEquals(id, second?.id, "ohne Transaktion bekommt eine zweite Instanz dieselbe Mail")
    }

    @Test
    fun concurrentRunsSendAnEmailOnlyOnce() = testCommittingComprehension {
        val id = !seedEmail("a@example.org")
        val config = env.env.config.skippingEveryone()

        val (a, b) = ConcurrentTx.runHoldingFirst(
            env,
            first = EmailService.processNext(unreachableSmtp, config),
            second = EmailService.processNext(unreachableSmtp, config),
        )

        a.fold(onSuccess = { assertEquals(SendOutcome.Sent(id), it) }, onError = { fail("$it") }, onDefect = { throw it })
        // B läuft, während A die Sperre hält: SKIP LOCKED überspringt die Mail.
        b.fold(
            onSuccess = { fail("zweite Instanz hat versendet: $it") },
            onError = { assertEquals(EmailError.NoEmailsToSend, it) },
            onDefect = { throw it },
        )
        val sentAt = !Jooq.query { fetchOne(EMAIL, EMAIL.ID.eq(id))!!.sentAt }.orDie()
        assertNotNull(sentAt)
    }

    @Test
    fun smtpFailureIsRecordedAndCommitted() = testCommittingComprehension {
        val id = !seedEmail("a@example.org")

        val outcome = !EmailService.processNext(unreachableSmtp, env.env.config).transact()

        assertTrue(outcome is SendOutcome.Failed && outcome.emailId == id, "$outcome")
        val record = !Jooq.query { fetchOne(EMAIL, EMAIL.ID.eq(id))!! }.orDie()
        assertEquals(null, record.sentAt)
        assertNotNull(record.lastErrorAt, "last_error_at muss den Commit überleben")
        // Wartezeit nach Fehler: dieselbe Mail wird nicht sofort wieder gezogen.
        val next = EmailService.processNext(unreachableSmtp, env.env.config).transact().unsafeRunSync(env)
        next.fold(onSuccess = { fail("sofort erneut gezogen: $it") }, onError = { assertEquals(EmailError.NoEmailsToSend, it) }, onDefect = { throw it })
    }
}
