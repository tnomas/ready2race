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
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
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

    @Test
    fun `unbekannte E-Mail rechnet genauso einen Argon2-Lauf wie ein falsches Passwort`() = testComprehension {
        val (_, email) = seedUser(!PasswordUtilities.hash(password))

        val beforeUnknown = PasswordUtilities.computations.get()
        assertKIOFails(AuthError.CredentialsIncorrect) {
            AuthService.login(LoginRequest(email = "niemand-${UUID.randomUUID()}@example.org", password = password)) {}
        }
        val unknownRuns = PasswordUtilities.computations.get() - beforeUnknown

        val beforeWrong = PasswordUtilities.computations.get()
        assertKIOFails(AuthError.CredentialsIncorrect) {
            AuthService.login(LoginRequest(email = email, password = "falsch-falsch")) {}
        }
        val wrongRuns = PasswordUtilities.computations.get() - beforeWrong

        assertEquals(1, unknownRuns, "unbekannte E-Mail")
        assertEquals(1, wrongRuns, "falsches Passwort")
    }

    @Test
    fun `falsches Passwort gegen alten billigen Hash rechnet zusaetzlich den Platzhalter`() = testComprehension {
        val (_, email) = seedUser(PasswordUtilities.hashWith(password, pepper, legacyFunction))

        val before = PasswordUtilities.computations.get()
        assertKIOFails(AuthError.CredentialsIncorrect) {
            AuthService.login(LoginRequest(email = email, password = "falsch-falsch")) {}
        }

        // Prüfung gegen den alten Hash plus Platzhalter mit aktuellen Parametern.
        assertEquals(2, PasswordUtilities.computations.get() - before)
    }

    @Test
    fun `hoechstens so viele Argon2-Laeufe gleichzeitig wie erlaubt`() {
        val permits = 2
        val running = AtomicInteger(0)
        val maxSeen = AtomicInteger(0)
        val callers = 8
        val start = CountDownLatch(1)
        val pool = Executors.newFixedThreadPool(callers)
        try {
            val done = (1..callers).map {
                pool.submit {
                    start.await()
                    PasswordUtilities.limited(permits) {
                        val now = running.incrementAndGet()
                        maxSeen.accumulateAndGet(now, ::maxOf)
                        Thread.sleep(30)
                        running.decrementAndGet()
                    }
                }
            }
            start.countDown()
            done.forEach { it.get(10, TimeUnit.SECONDS) }
        } finally {
            pool.shutdownNow()
        }

        assertEquals(permits, maxSeen.get())
    }

    @Test
    fun `Vorgabe fuer gleichzeitige Argon2-Laeufe ist die Kernzahl`() {
        assertEquals(
            Runtime.getRuntime().availableProcessors(),
            Config.Security(pepper = pepper).argon2MaxConcurrent,
        )
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
