package de.lambda9.ready2race.testing

import de.lambda9.ready2race.backend.app.JEnv
import de.lambda9.tailwind.core.Exit
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.KIO.Companion.unsafeRunSync
import de.lambda9.tailwind.core.extensions.exit.fold
import de.lambda9.tailwind.jooq.Jooq
import de.lambda9.tailwind.jooq.transact
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread
import kotlin.test.fail

/**
 * Zwei echte Transaktionen gegeneinander, deterministisch verschränkt (für
 * [testCommittingComprehension]):
 *
 * 1. Transaktion A führt [first] aus und bleibt danach OFFEN (noch kein Commit).
 * 2. Transaktion B startet mit [second].
 * 3. A committet erst, wenn B entweder fertig ist (keine Sperre hat B aufgehalten - der
 *    Fehlerfall, den die Tests belegen) oder in der Datenbank auf eine Sperre wartet
 *    (`pg_stat_activity.wait_event_type = 'Lock'`) - der korrigierte Fall.
 *
 * So läuft B ohne Sperre garantiert auf dem Stand VOR dem Commit von A, mit Sperre garantiert
 * danach. Zurück kommen beide Exits; Fehlschläge von A gelten als Testfehler.
 */
object ConcurrentTx {

    fun <A, B> runHoldingFirst(
        env: JEnv,
        first: KIO<JEnv, Any?, A>,
        second: KIO<JEnv, Any?, B>,
        timeoutSeconds: Long = 10,
    ): Pair<Exit<Any?, A>, Exit<Any?, B>> {
        val firstReady = CountDownLatch(1)
        val secondDone = AtomicBoolean(false)
        var exitA: Exit<Any?, A>? = null
        var exitB: Exit<Any?, B>? = null

        val threadA = thread(name = "tx-A") {
            exitA = KIO.comprehension {
                val result = !first
                !KIO.effect {
                    firstReady.countDown()
                    val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(timeoutSeconds)
                    while (!secondDone.get() && !someoneWaitsOnLock(env)) {
                        if (System.nanoTime() > deadline) error("Transaktion B kam weder zum Ende noch an eine Sperre")
                        Thread.sleep(20)
                    }
                }
                KIO.ok(result)
            }.transact().unsafeRunSync(env)
            firstReady.countDown()
        }

        if (!firstReady.await(timeoutSeconds, TimeUnit.SECONDS)) fail("Transaktion A kam nicht bis zum Halt")

        val threadB = thread(name = "tx-B") {
            exitB = second.transact().unsafeRunSync(env)
            secondDone.set(true)
        }

        threadA.join(TimeUnit.SECONDS.toMillis(timeoutSeconds * 2))
        threadB.join(TimeUnit.SECONDS.toMillis(timeoutSeconds * 2))

        val a = exitA ?: fail("Transaktion A endete nicht")
        val b = exitB ?: fail("Transaktion B endete nicht")
        a.fold(
            onSuccess = {},
            onError = { fail("Transaktion A scheiterte: $it") },
            onDefect = { fail("Transaktion A starb: $it") },
        )
        return a to b
    }

    private fun someoneWaitsOnLock(env: JEnv): Boolean =
        Jooq.query {
            fetchValue(
                "select count(*) from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'"
            ) as Long
        }.unsafeRunSync(env).fold(
            onSuccess = { it > 0 },
            onError = { false },
            onDefect = { throw it },
        )
}
