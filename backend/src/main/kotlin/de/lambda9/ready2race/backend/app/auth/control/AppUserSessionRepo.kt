package de.lambda9.ready2race.backend.app.auth.control

import de.lambda9.ready2race.backend.database.delete
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserSessionRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.APP_USER_SESSION
import de.lambda9.ready2race.backend.database.insertReturning
import de.lambda9.ready2race.backend.database.selectOne
import de.lambda9.tailwind.jooq.JIO
import de.lambda9.tailwind.jooq.Jooq
import org.jooq.impl.DSL
import java.time.LocalDateTime
import java.util.UUID

object AppUserSessionRepo {

    fun create(record: AppUserSessionRecord) = APP_USER_SESSION.insertReturning(record) { TOKEN }

    /** Die Sitzung zum Token, sofern sie noch nicht abgelaufen ist. */
    fun getValid(token: String) = APP_USER_SESSION.selectOne {
        DSL.and(
            TOKEN.eq(token),
            EXPIRES_AT.gt(LocalDateTime.now())
        )
    }

    /** Gezieltes Verlängern ohne vorheriges Lesen der Zeile. */
    fun extend(token: String, expiresAt: LocalDateTime): JIO<Int> = Jooq.query {
        update(APP_USER_SESSION)
            .set(APP_USER_SESSION.EXPIRES_AT, expiresAt)
            .where(APP_USER_SESSION.TOKEN.eq(token))
            .execute()
    }

    fun delete(token: String?) = APP_USER_SESSION.delete { TOKEN.eq(token) }
    /** Alle Sitzungen eines Kontos beenden, z.B. nach einem Passwort-Reset. */
    fun deleteByUser(appUserId: UUID) = APP_USER_SESSION.delete { APP_USER.eq(appUserId) }

    fun deleteExpired() = APP_USER_SESSION.delete { EXPIRES_AT.le(LocalDateTime.now()) }
}