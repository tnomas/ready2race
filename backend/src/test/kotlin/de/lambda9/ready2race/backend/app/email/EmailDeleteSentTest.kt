package de.lambda9.ready2race.backend.app.email

import de.lambda9.ready2race.backend.app.email.boundary.EmailService
import de.lambda9.ready2race.backend.app.email.entity.EmailLanguage
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserInvitationRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserInvitationToEmailRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.EmailAttachmentRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.EmailRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.APP_USER_INVITATION
import de.lambda9.ready2race.backend.database.generated.tables.references.APP_USER_INVITATION_TO_EMAIL
import de.lambda9.ready2race.backend.database.generated.tables.references.EMAIL
import de.lambda9.ready2race.backend.database.generated.tables.references.EMAIL_ATTACHMENT
import de.lambda9.ready2race.backend.database.insert
import de.lambda9.ready2race.backend.security.RandomUtilities
import de.lambda9.ready2race.testing.testComprehension
import de.lambda9.tailwind.jooq.Jooq
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Was der wieder eingeschaltete Lösch-Job wegräumt - und was er stehen lässt.
 */
class EmailDeleteSentTest {

    private fun mail(sentAt: LocalDateTime?, keepSeconds: Long = 0, recipient: String = "x@example.org"): EmailRecord {
        val now = LocalDateTime.now()
        return EmailRecord(
            id = UUID.randomUUID(),
            recipient = recipient,
            subject = "Betreff",
            body = "https://example.org/resetPassword/${RandomUtilities.token()}",
            bodyIsHtml = false,
            priority = 1,
            dontSendBefore = now.minusHours(2),
            keepAfterSending = keepSeconds,
            sentAt = sentAt,
            createdAt = now.minusHours(2),
            updatedAt = now.minusHours(2),
        )
    }

    private fun exists(id: UUID) = Jooq.query { fetchExists(EMAIL, EMAIL.ID.eq(id)) }

    @Test
    fun sentMailsLeaveAfterTheirRetentionWithAttachments() = testComprehension {
        val now = LocalDateTime.now()
        val gone = mail(sentAt = now.minusMinutes(5))
        val kept = mail(sentAt = now.minusMinutes(5), keepSeconds = 7 * 24 * 3600)
        val unsent = mail(sentAt = null)
        listOf(gone, kept, unsent).forEach { !EMAIL.insert(it) }
        !EMAIL_ATTACHMENT.insert(EmailAttachmentRecord(email = gone.id, name = "Ausschreibung.pdf", data = ByteArray(8)))

        !EmailService.deleteSent()

        assertEquals(false, !exists(gone.id))
        assertEquals(0, !Jooq.query { fetchCount(EMAIL_ATTACHMENT, EMAIL_ATTACHMENT.EMAIL.eq(gone.id)) })
        assertEquals(true, !exists(kept.id), "Haltefrist läuft noch")
        assertEquals(true, !exists(unsent.id), "nicht versandt")
    }

    /** Die Einladungsliste zeigt Versandzeit und -fehler der verknüpften Mail. */
    @Test
    fun mailsOfOpenInvitationsStay() = testComprehension {
        val now = LocalDateTime.now()
        val email = "eingeladen-${UUID.randomUUID()}@example.org"
        val linked = mail(sentAt = now.minusMinutes(5), recipient = email)
        !EMAIL.insert(linked)
        val invitationId = UUID.randomUUID()
        !APP_USER_INVITATION.insert(
            AppUserInvitationRecord(
                id = invitationId,
                token = RandomUtilities.token(),
                email = email,
                firstname = "Neue",
                lastname = "Person",
                language = EmailLanguage.DE.name,
                expiresAt = now.plusDays(7),
                createdAt = now,
            )
        )
        !APP_USER_INVITATION_TO_EMAIL.insert(
            AppUserInvitationToEmailRecord(appUserInvitation = invitationId, email = linked.id)
        )

        !EmailService.deleteSent()

        assertEquals(true, !exists(linked.id))
    }
}
