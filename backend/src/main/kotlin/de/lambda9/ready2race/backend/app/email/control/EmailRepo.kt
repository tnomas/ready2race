package de.lambda9.ready2race.backend.app.email.control

import de.lambda9.ready2race.backend.beforeNow
import de.lambda9.ready2race.backend.database.delete
import de.lambda9.ready2race.backend.database.generated.tables.records.EmailRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.SmtpConfigOverrideRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.APP_USER_INVITATION_TO_EMAIL
import de.lambda9.ready2race.backend.database.generated.tables.references.APP_USER_REGISTRATION_TO_EMAIL
import de.lambda9.ready2race.backend.database.generated.tables.references.EMAIL
import de.lambda9.ready2race.backend.database.generated.tables.references.SMTP_CONFIG_OVERRIDE
import de.lambda9.ready2race.backend.database.insert
import de.lambda9.ready2race.backend.database.insertReturning
import de.lambda9.ready2race.backend.database.selectOne
import de.lambda9.ready2race.backend.database.update
import de.lambda9.tailwind.core.extensions.kio.andThen
import de.lambda9.tailwind.jooq.JIO
import de.lambda9.tailwind.jooq.Jooq
import org.jooq.DatePart
import org.jooq.impl.DSL
import java.time.LocalDateTime
import java.util.*
import kotlin.time.Duration

object EmailRepo {

    fun create(record: EmailRecord) = EMAIL.insertReturning(record) { ID }

    fun update(id: UUID, f: EmailRecord.() -> Unit) = EMAIL.update(f) { ID.eq(id) }
    fun update(record: EmailRecord, f: EmailRecord.() -> Unit) = EMAIL.update(record, f)

    /**
     * Versandte Mails nach ihrer Haltefrist löschen (samt Anhängen, Fremdschlüssel mit Cascade).
     *
     * Ausgenommen sind Mails, an denen noch eine offene Einladung oder Registrierung hängt: deren
     * Listen zeigen Versandzeit und -fehler der verknüpften Mail. Fällt die Einladung oder
     * Registrierung weg (angenommen, abgelaufen, zurückgezogen), wird die Mail im nächsten
     * Durchlauf mitgenommen.
     */
    fun deleteSent() = EMAIL.delete {
        DSL.and(
            SENT_AT.isNotNull,
            DSL.localDateTimeAdd(
                SENT_AT,
                KEEP_AFTER_SENDING,
                DatePart.SECOND
            ).lt(LocalDateTime.now()),
            DSL.notExists(
                DSL.selectOne().from(APP_USER_INVITATION_TO_EMAIL).where(APP_USER_INVITATION_TO_EMAIL.EMAIL.eq(ID))
            ),
            DSL.notExists(
                DSL.selectOne().from(APP_USER_REGISTRATION_TO_EMAIL).where(APP_USER_REGISTRATION_TO_EMAIL.EMAIL.eq(ID))
            ),
        )
    }

    fun getAndLockNext(
        retryAfterError: Duration,
    ): JIO<EmailRecord?> = Jooq.query {
        LocalDateTime.now().let { now ->
            with(EMAIL) {
                selectFrom(this)
                    .where(DONT_SEND_BEFORE.le(now))
                    .and(SENT_AT.isNull)
                    .and(
                        DSL.or(
                            LAST_ERROR_AT.isNull,
                            LAST_ERROR_AT.lt(retryAfterError.beforeNow())
                        )
                    )
                    .orderBy(PRIORITY.desc(), CREATED_AT.asc())
                    .forUpdate()
                    .skipLocked()
                    .fetchAny()
            }
        }
    }

    fun getSMTPConfigOverride(): JIO<SmtpConfigOverrideRecord?> =
        SMTP_CONFIG_OVERRIDE.selectOne { DSL.trueCondition() }

    fun replaceSMTPConfigOverride(override: SmtpConfigOverrideRecord) =
        SMTP_CONFIG_OVERRIDE.delete { DSL.trueCondition() }.andThen {
        SMTP_CONFIG_OVERRIDE.insert(override)}

    fun deleteSMTPConfigOverride() =
        SMTP_CONFIG_OVERRIDE.delete { DSL.trueCondition()}
}