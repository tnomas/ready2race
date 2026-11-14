package de.lambda9.ready2race.backend.app.auth

import de.lambda9.ready2race.backend.app.JEnv
import de.lambda9.ready2race.backend.app.appuser.control.AppUserRepo
import de.lambda9.ready2race.backend.app.auth.boundary.AuthService
import de.lambda9.ready2race.backend.app.auth.control.AppUserSessionRepo
import de.lambda9.ready2race.backend.app.auth.entity.AuthError
import de.lambda9.ready2race.backend.app.email.entity.EmailLanguage
import de.lambda9.ready2race.backend.database.SYSTEM_USER
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserSessionRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.APP_USER_SESSION
import de.lambda9.ready2race.backend.database.selectOne
import de.lambda9.ready2race.backend.security.RandomUtilities
import de.lambda9.ready2race.testing.kio.TestComprehensionScope
import de.lambda9.ready2race.testing.testComprehension
import java.time.Duration
import java.time.LocalDateTime
import java.time.temporal.ChronoUnit
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Das gleitende 6-Stunden-Fenster der Sitzung wird nicht mehr bei jeder Anfrage geschrieben, sondern
 * erst, wenn der letzte Stempel älter als eine Minute ist.
 */
class SessionExtendTest {

    private fun TestComprehensionScope<JEnv>.seedSession(expiresAt: LocalDateTime): String {
        val id = UUID.randomUUID()
        !AppUserRepo.create(
            AppUserRecord(
                id = id,
                email = "sitzung-$id@example.org",
                firstname = "Sitzung",
                lastname = "Probe",
                password = "x",
                language = EmailLanguage.DE.name,
                createdAt = LocalDateTime.now(),
                createdBy = SYSTEM_USER,
                updatedAt = LocalDateTime.now(),
                updatedBy = SYSTEM_USER,
            )
        )
        val token = RandomUtilities.token()
        !AppUserSessionRepo.create(
            AppUserSessionRecord(
                token = token,
                appUser = id,
                expiresAt = expiresAt,
                createdAt = LocalDateTime.now(),
            )
        )
        return token
    }

    private fun TestComprehensionScope<JEnv>.expiresAt(token: String): LocalDateTime =
        (!APP_USER_SESSION.selectOne { TOKEN.eq(token) })!!.expiresAt!!

    @Test
    fun `frisch verlaengerte Sitzung wird beim naechsten Aufruf nicht erneut geschrieben`() = testComprehension {
        val stamped = LocalDateTime.now().plusHours(6).minusSeconds(10).truncatedTo(ChronoUnit.MICROS)
        val token = seedSession(stamped)

        !AuthService.useSessionToken(token)
        !AuthService.useSessionToken(token)

        assertEquals(stamped, expiresAt(token))
    }

    @Test
    fun `Stempel aelter als eine Minute wird auf volle sechs Stunden verlaengert`() = testComprehension {
        val stamped = LocalDateTime.now().plusHours(6).minusMinutes(2)
        val token = seedSession(stamped)

        !AuthService.useSessionToken(token)

        val extended = expiresAt(token)
        val remaining = Duration.between(LocalDateTime.now(), extended)
        assertTrue(extended.isAfter(stamped), "nicht verlängert: $extended")
        assertTrue(remaining > Duration.ofHours(6).minusSeconds(5), "Restlaufzeit $remaining")
    }

    @Test
    fun `kurz vor Ablauf genutzte Sitzung lebt weiter`() = testComprehension {
        val token = seedSession(LocalDateTime.now().plusSeconds(30))

        !AuthService.useSessionToken(token)

        assertTrue(expiresAt(token).isAfter(LocalDateTime.now().plusHours(5)))
    }

    @Test
    fun `abgelaufene Sitzung bleibt ungueltig und wird nicht verlaengert`() = testComprehension {
        val expired = LocalDateTime.now().minusSeconds(1).truncatedTo(ChronoUnit.MICROS)
        val token = seedSession(expired)

        assertKIOFails(AuthError.TokenInvalid) { AuthService.useSessionToken(token) }
        assertEquals(expired, expiresAt(token))
    }
}
