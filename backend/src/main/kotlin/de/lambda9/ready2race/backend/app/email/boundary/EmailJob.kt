package de.lambda9.ready2race.backend.app.email.boundary

import de.lambda9.ready2race.backend.app.email.entity.EmailError
import de.lambda9.ready2race.backend.schedule.DynamicIntervalJobState
import io.github.oshai.kotlinlogging.KotlinLogging
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Wie der Versandjob auf einen Fehler von [EmailService.sendNext] reagiert.
 *
 * Fehlende SMTP-Daten sind KEIN Ende des Jobs: der Admin kann sie zur Laufzeit in der Oberfläche
 * setzen (SMTP-Übersteuerung). Mit `Fatal` blieben danach alle Mails - Passwort-Reset,
 * Einladungen, Meldebestätigungen - bis zum nächsten Neustart liegen. Deshalb wartet der Job wie
 * bei leerer Warteschlange und versucht es im nächsten Takt wieder; gewarnt wird einmal, bis
 * wieder eine Mail rausging.
 */
object EmailJob {

    private val logger = KotlinLogging.logger {}

    private val smtpMissingReported = AtomicBoolean(false)

    fun stateFor(error: EmailError): DynamicIntervalJobState = when (error) {
        EmailError.SmtpConfigMissing -> {
            if (smtpMissingReported.compareAndSet(false, true)) {
                logger.warn { "No SMTP configuration (environment or override) - e-mails stay queued until one is set" }
            }
            DynamicIntervalJobState.Empty
        }

        EmailError.NoEmailsToSend -> DynamicIntervalJobState.Empty
        is EmailError.SendingFailed -> {
            logger.warn(error.cause) { "Error sending email ${error.emailId}" }
            DynamicIntervalJobState.Processed
        }
    }

    /** Nach einem erfolgreichen Versand darf eine spätere Lücke wieder gemeldet werden. */
    fun sent(): DynamicIntervalJobState {
        smtpMissingReported.set(false)
        return DynamicIntervalJobState.Processed
    }
}
