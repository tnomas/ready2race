package de.lambda9.ready2race.backend.security

import com.password4j.Argon2Function
import com.password4j.Password
import com.password4j.types.Argon2
import de.lambda9.ready2race.backend.app.App
import de.lambda9.tailwind.core.KIO

object PasswordUtilities {

    const val DEFAULT_PASSWORD_MIN_LENGTH = 10

    /**
     * Speicherbedarf eines Argon2id-Hashes in KiB, wenn `SECURITY_ARGON2_MEMORY_KIB` nicht gesetzt ist.
     * 19 MiB bei zwei Durchläufen ist die kleinste der gängigen Empfehlungen für Argon2id.
     */
    const val DEFAULT_ARGON2_MEMORY_KIB = 19456

    /** Argon2 verlangt mindestens 8 KiB je Spur; wir rechnen mit einer Spur. */
    const val MIN_ARGON2_MEMORY_KIB = 8

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

    fun hash(plain: String): App<Nothing, String> = KIO.access { env ->
        val security = env.env.config.security
        hashWith(plain, security.pepper, argon2(security.argon2MemoryKiB))
    }

    internal fun hashWith(plain: String, pepper: String, function: Argon2Function): String =
        Password
            .hash(plain)
            .addRandomSalt()
            .addPepper(pepper)
            .with(function)
            .result

    fun check(plain: String, password: String): App<Nothing, Boolean> = KIO.access { env ->
        checkWith(plain, password, env.env.config.security.pepper)
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
