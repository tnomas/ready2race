package de.lambda9.ready2race.backend.calls.responses

import io.github.oshai.kotlinlogging.KotlinLogging
import kotlinx.coroutines.CancellationException

/**
 * Buffer for side effects that must only become visible once the surrounding database transaction
 * has been committed.
 *
 * [respondKIO] wraps the whole request in [collect]: `KIO`'s interpreter ([de.lambda9.tailwind.core.internal.RunLoop])
 * as well as `transact` run the entire comprehension synchronously on the calling thread, so a
 * [ThreadLocal] reliably scopes the buffer to exactly one request. Services register their effects
 * via [register] instead of firing them inline; [respondKIO] flushes them after a successful commit
 * and drops them when the transaction rolled back.
 *
 * When no buffer is installed - non-HTTP callers such as scheduled jobs or unit tests - [register]
 * falls back to running the effect immediately.
 *
 * Buffering only applies to the one transaction [respondKIO] wraps: KIO effects triggered outside
 * of it - e.g. a bare comprehension `!` call in a [respondComprehension] block that runs its own
 * `transact`/`unsafeRunSync` rather than going through that wrapping call - see no installed
 * buffer and therefore also fall back to firing immediately.
 */
object AfterCommit {

    private val logger = KotlinLogging.logger {}

    private val buffer = ThreadLocal<MutableList<() -> Unit>>()

    /**
     * Registers [effect] to be run after the surrounding transaction committed, or runs it
     * immediately if there is no surrounding request.
     */
    fun register(effect: () -> Unit) {
        val pending = buffer.get()
        if (pending == null) {
            effect()
        } else {
            pending.add(effect)
        }
    }

    /**
     * Installs a buffer for the duration of [block] and returns its result together with the
     * effects registered while it ran, in registration order.
     */
    fun <A> collect(block: () -> A): Pair<A, List<() -> Unit>> {
        val previous = buffer.get()
        val pending = mutableListOf<() -> Unit>()
        buffer.set(pending)
        return try {
            val result = block()
            result to pending.toList()
        } finally {
            if (previous == null) {
                buffer.remove()
            } else {
                buffer.set(previous)
            }
        }
    }

    /**
     * Runs all [effects] in order. A failing effect is logged and never fails the request.
     */
    fun flush(effects: List<() -> Unit>) {
        effects.forEach { effect ->
            try {
                effect()
            } catch (ex: CancellationException) {
                throw ex
            } catch (ex: Exception) {
                logger.warn(ex) { "After-commit effect failed" }
            }
        }
    }
}
