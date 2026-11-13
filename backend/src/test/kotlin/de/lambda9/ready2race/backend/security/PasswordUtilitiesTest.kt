package de.lambda9.ready2race.backend.security

import de.lambda9.ready2race.backend.app.JEnv
import de.lambda9.ready2race.backend.app.appuser.control.AppUserRepo
import de.lambda9.ready2race.backend.app.auth.boundary.AuthService
import de.lambda9.ready2race.backend.app.auth.entity.AuthError
import de.lambda9.ready2race.backend.app.auth.entity.LoginRequest
import de.lambda9.ready2race.backend.app.email.entity.EmailLanguage
import de.lambda9.ready2race.backend.config.Config
import de.lambda9.ready2race.backend.database.SYSTEM_USER
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserRecord
import de.lambda9.ready2race.testing.TEST_ARGON2_MEMORY_KIB
import de.lambda9.ready2race.testing.kio.TestComprehensionScope
import de.lambda9.ready2race.testing.testComprehension
import java.time.LocalDateTime
import java.util.UUID
import kotlin.system.measureTimeMillis
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

class PasswordUtilitiesTest {

    private val pepper = "pepper"
    private val password = "Ruder-Regatta-2026"

    /** Der Stand bis 11/2026 aus psw4j.properties: 15 KiB, zwei Durchläufe, eine Spur. */
    private val legacyFunction = PasswordUtilities.argon2(15)

    @Test
    fun `Vorgabe sind 19 MiB Speicher, und der Hash traegt sie im PHC-String`() {
        assertEquals(19456, PasswordUtilities.DEFAULT_ARGON2_MEMORY_KIB)
        assertEquals(19456, Config.Security(pepper = pepper).argon2MemoryKiB)

        val function = PasswordUtilities.argon2(PasswordUtilities.DEFAULT_ARGON2_MEMORY_KIB)
        // Einmal aufwärmen (JIT), dann messen - die Zahl steht im Testprotokoll.
        PasswordUtilities.hashWith(password, pepper, function)
        var hash = ""
        val millis = measureTimeMillis { hash = PasswordUtilities.hashWith(password, pepper, function) }
        println("Argon2id m=19456,t=2,p=1: ${millis} ms je Hash")

        assertTrue(hash.startsWith("\$argon2id\$v=19\$m=19456,t=2,p=1\$"), hash)
    }

    @Test
    fun `alter Hash mit 15 KiB laesst sich weiter pruefen`() {
        val legacy = PasswordUtilities.hashWith(password, pepper, legacyFunction)
        assertTrue(legacy.startsWith("\$argon2id\$v=19\$m=15,t=2,p=1\$"), legacy)
    }

    private fun TestComprehensionScope<JEnv>.seedUser(passwordHash: String): Pair<UUID, String> {
        val id = UUID.randomUUID()
        val email = "argon-$id@example.org"
        !AppUserRepo.create(
            AppUserRecord(
                id = id,
                email = email,
                firstname = "Hash",
                lastname = "Probe",
                password = passwordHash,
                language = EmailLanguage.DE.name,
                createdAt = LocalDateTime.now(),
                createdBy = SYSTEM_USER,
                updatedAt = LocalDateTime.now(),
                updatedBy = SYSTEM_USER,
            )
        )
        return id to email
    }

    private fun TestComprehensionScope<JEnv>.storedHash(id: UUID): String =
        (!AppUserRepo.get(id))!!.password!!

    @Test
    fun `Login mit altem Hash gelingt und hebt den Hash auf den aktuellen Stand`() = testComprehension {
        val legacy = PasswordUtilities.hashWith(password, pepper, legacyFunction)
        val (id, email) = seedUser(legacy)

        !AuthService.login(LoginRequest(email = email, password = password)) {}

        val upgraded = storedHash(id)
        assertNotEquals(legacy, upgraded)
        assertTrue(
            upgraded.startsWith("\$argon2id\$v=19\$m=$TEST_ARGON2_MEMORY_KIB,t=2,p=1\$"),
            upgraded,
        )
        assertEquals(false, !PasswordUtilities.needsRehash(upgraded))

        // Der neue Hash trägt weiter: zweiter Login gelingt, ohne erneut zu schreiben.
        !AuthService.login(LoginRequest(email = email, password = password)) {}
        assertEquals(upgraded, storedHash(id))
    }

    @Test
    fun `falsches Passwort scheitert auch mit altem Hash und laesst den Hash unberuehrt`() = testComprehension {
        val legacy = PasswordUtilities.hashWith(password, pepper, legacyFunction)
        val (id, email) = seedUser(legacy)

        assertKIOFails(AuthError.CredentialsIncorrect) {
            AuthService.login(LoginRequest(email = email, password = "falsch-falsch")) {}
        }
        assertEquals(legacy, storedHash(id))
        assertEquals(true, !PasswordUtilities.needsRehash(legacy))
    }

    @Test
    fun `aktueller Hash wird beim Login nicht neu geschrieben`() = testComprehension {
        val current = !PasswordUtilities.hash(password)
        val (id, email) = seedUser(current)

        !AuthService.login(LoginRequest(email = email, password = password)) {}

        assertEquals(current, storedHash(id))
    }

    @Test
    fun `unlesbarer Hash gilt als falsches Passwort statt als Defekt`() = testComprehension {
        val (_, email) = seedUser("kein-argon2-hash")

        assertKIOFails(AuthError.CredentialsIncorrect) {
            AuthService.login(LoginRequest(email = email, password = password)) {}
        }
    }
}
