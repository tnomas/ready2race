package de.lambda9.ready2race.backend.security

import com.password4j.Argon2Function
import com.password4j.Password
import com.password4j.types.Argon2
import de.lambda9.ready2race.backend.app.App
import de.lambda9.tailwind.core.KIO
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Semaphore
import java.util.concurrent.atomic.AtomicLong

object PasswordUtilities {

    const val DEFAULT_PASSWORD_MIN_LENGTH = 10

    /**
     * Speicherbedarf eines Argon2id-Hashes in KiB, wenn `SECURITY_ARGON2_MEMORY_KIB` nicht gesetzt ist.
     * 19 MiB bei zwei Durchläufen ist die kleinste der gängigen Empfehlungen für Argon2id.
     */
    const val DEFAULT_ARGON2_MEMORY_KIB = 19456

    /** Argon2 verlangt mindestens 8 KiB je Spur; wir rechnen mit einer Spur. */
    const val MIN_ARGON2_MEMORY_KIB = 8

    /**
     * Wie viele Argon2-Rechnungen gleichzeitig laufen dürfen, wenn
     * `SECURITY_ARGON2_MAX_CONCURRENT` nicht gesetzt ist: so viele, wie es Kerne gibt. Mehr bringt
     * keinen Durchsatz (die Rechnung ist CPU-gebunden), kostet aber je Lauf den vollen
     * Argon2-Speicher (19 MiB) - 64 parallele Logins auf Dispatchers.IO wären über 1 GiB Heap.
     */
    fun defaultArgon2MaxConcurrent(): Int = Runtime.getRuntime().availableProcessors().coerceAtLeast(1)

    private const val ARGON2_ITERATIONS = 2
    private const val ARGON2_PARALLELISM = 1
    private const val ARGON2_OUTPUT_LENGTH = 32
    private const val ARGON2_VERSION = Argon2Function.ARGON2_VERSION_13

    /**
     * Die Parameter, mit denen neue Hashes entstehen. Bestehende Hashes tragen ihre Parameter im
     * PHC-String (`$argon2id$v=19$m=…,t=…,p=…$…`) und werden mit genau diesen geprüft.
     */
    fun argon2(memoryKiB: Int): Argon2Function =
        Argon2Function.getInstance(
            memoryKiB,
            ARGON2_ITERATIONS,
            ARGON2_PARALLELISM,
            ARGON2_OUTPUT_LENGTH,
            Argon2.ID,
            ARGON2_VERSION,
        )

    private val gates = ConcurrentHashMap<Int, Semaphore>()

    /** Zahl der bisher gerechneten Argon2-Läufe (Hash oder Prüfung) - für Tests. */
    internal val computations = AtomicLong()

    /**
     * Führt eine Argon2-Rechnung aus, höchstens [permits] gleichzeitig. Wer warten muss, wartet
     * fair in Ankunftsreihenfolge. Die Grenze gilt prozessweit je konfigurierter Größe.
     */
    internal fun <A> limited(permits: Int, block: () -> A): A {
        val gate = gates.computeIfAbsent(permits) { Semaphore(it, true) }
        gate.acquire()
        try {
            computations.incrementAndGet()
            return block()
        } finally {
            gate.release()
        }
    }

    fun hash(plain: String): App<Nothing, String> = KIO.access { env ->
        val security = env.env.config.security
        limited(security.argon2MaxConcurrent) {
            hashWith(plain, security.pepper, argon2(security.argon2MemoryKiB))
        }
    }

    internal fun hashWith(plain: String, pepper: String, function: Argon2Function): String =
        Password
            .hash(plain)
            .addRandomSalt()
            .addPepper(pepper)
            .with(function)
            .result

    fun check(plain: String, password: String): App<Nothing, Boolean> = KIO.access { env ->
        val security = env.env.config.security
        limited(security.argon2MaxConcurrent) { checkWith(plain, password, security.pepper) }
    }

    private val dummyHashes = ConcurrentHashMap<Int, String>()

    /**
     * Prüft gegen einen Platzhalter-Hash mit den aktuell konfigurierten Parametern und verwirft
     * das Ergebnis. Für den Login mit unbekannter E-Mail: Ohne diese Rechnung antwortete er um die
     * Dauer eines Argon2-Laufs (rund 55 ms) schneller als mit falschem Passwort, und die
     * Antwortzeit verriete, ob es ein Konto gibt.
     */
    fun checkAgainstDummy(plain: String): App<Nothing, Unit> = KIO.access { env ->
        val security = env.env.config.security
        val dummy = dummyHashes.computeIfAbsent(security.argon2MemoryKiB) {
            hashWith(RandomUtilities.alphanumerical(32), security.pepper, argon2(it))
        }
        limited(security.argon2MaxConcurrent) { checkWith(plain, dummy, security.pepper) }
        Unit
    }

    /**
     * Prüft mit den Parametern, die im gespeicherten Hash stehen - nicht mit den aktuell
     * konfigurierten. Nur so lassen sich Hashes aus älteren Parameterständen weiter prüfen.
     */
    private fun checkWith(plain: String, password: String, pepper: String): Boolean {
        val function = runCatching { Argon2Function.getInstanceFromHash(password) }.getOrNull()
            ?: return false
        return Password
            .check(plain, password)
            .addPepper(pepper)
            .with(function)
    }

    /**
     * `true`, wenn der gespeicherte Hash nicht mit den aktuell konfigurierten Parametern entstanden
     * ist und beim nächsten erfolgreichen Login neu berechnet werden soll.
     */
    fun needsRehash(password: String): App<Nothing, Boolean> = KIO.access { env ->
        val target = argon2(env.env.config.security.argon2MemoryKiB)
        val current = runCatching { Argon2Function.getInstanceFromHash(password) }.getOrNull()
        current != target
    }

    fun generate(): String =
        RandomUtilities.alphanumerical(DEFAULT_PASSWORD_MIN_LENGTH)

}
