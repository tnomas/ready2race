package de.lambda9.ready2race.backend.app.email

import de.lambda9.ready2race.backend.app.email.boundary.EmailJob
import de.lambda9.ready2race.backend.app.email.entity.EmailError
import de.lambda9.ready2race.backend.schedule.DynamicIntervalJobState
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Der Versandjob darf an fehlenden SMTP-Daten nicht sterben: der Admin kann sie zur Laufzeit
 * setzen, und `Fatal` beendet die Schleife des Schedulers für immer.
 */
class EmailJobTest {

    @Test
    fun missingSmtpConfigKeepsTheJobAlive() {
        assertEquals(DynamicIntervalJobState.Empty, EmailJob.stateFor(EmailError.SmtpConfigMissing))
        assertEquals(DynamicIntervalJobState.Empty, EmailJob.stateFor(EmailError.SmtpConfigMissing))
    }

    @Test
    fun otherErrorsKeepTheirMeaning() {
        assertEquals(DynamicIntervalJobState.Empty, EmailJob.stateFor(EmailError.NoEmailsToSend))
        assertEquals(
            DynamicIntervalJobState.Processed,
            EmailJob.stateFor(EmailError.SendingFailed(UUID.randomUUID(), RuntimeException("smtp down"))),
        )
        assertEquals(DynamicIntervalJobState.Processed, EmailJob.sent())
    }
}
