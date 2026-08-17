/**
 * Durable offline buffer for captured time marks. Hand-rolled IndexedDB (db `r2r-timing`, stores
 * `pendingTimeMarks` and `deadTimeMarks`, keyPath `id`) — no new dependencies.
 *
 * **Write-ahead, not fallback.** The capture flow enqueues *before* it POSTs and only removes the
 * item again once the server has confirmed it (see `CaptureButton`). The queue is therefore the
 * single durable record of a capture: killing the tab mid-POST loses nothing, because the next drain
 * simply re-POSTs the item and the server deduplicates by the mark's client-generated UUID.
 *
 * The queue is global by design: it is not scoped to one event. A mark captured on this device for
 * event A must still be drained and posted even if the board now shows event B — see `drain`.
 *
 * **Dead letters.** An item whose POST fails permanently (a 4xx that retrying cannot fix) is moved
 * to `deadTimeMarks` instead of being retried forever, so one poison item can never block the rest
 * of the queue. Dead items are kept (never silently dropped) and surfaced to the user via their own
 * banner.
 */
export type PendingTimeMark = {
    id: string
    eventId: string
    station: string
    timestampMillis: number
    /** Number of POST attempts made so far — incremented by `drain` on every non-`ok` outcome. */
    attempts: number
    /** HTTP status of the most recent attempt, if there was a response at all (diagnostics only). */
    lastStatus?: number
}

/**
 * Result of a single `post` attempt:
 * - `ok` — the server accepted the mark; the item is removed from the queue.
 * - `retryable` — transient (network error, 5xx, 408, 429); the item is kept and retried later.
 * - `permanent` — retrying can never succeed (4xx other than 408/429); the item is moved to the
 *   dead-letter store.
 */
export type PostOutcome = 'ok' | 'retryable' | 'permanent'

/** Either the bare outcome, or the outcome plus the HTTP status that produced it. */
export type PostResult = PostOutcome | {outcome: PostOutcome; status?: number}

export type QueueCounts = {
    /** Items still waiting to be (re-)posted. */
    pending: number
    /** Items that failed permanently and will never be retried. */
    dead: number
}

const DB_NAME = 'r2r-timing'
/** v1: `pendingTimeMarks` only. v2: adds `deadTimeMarks`. */
const DB_VERSION = 2
const STORE_NAME = 'pendingTimeMarks'
const DEAD_STORE_NAME = 'deadTimeMarks'

/**
 * Classify an HTTP status into a drain outcome. A 4xx means the request itself is unacceptable to
 * the server, so replaying it byte-for-byte cannot help — except for 408 (request timeout) and 429
 * (rate limited), which are explicitly "come back later".
 */
export function classifyStatus(status: number): Exclude<PostOutcome, 'ok'> {
    if (status >= 400 && status < 500 && status !== 408 && status !== 429) return 'permanent'
    return 'retryable'
}

/**
 * Open (and, on a version bump, upgrade) the database. Every terminal event settles the promise —
 * including `onblocked`, which fires when another tab still holds the DB open at the old version and
 * would otherwise leave the caller hanging forever.
 */
function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION)
        let settled = false

        request.onupgradeneeded = () => {
            const db = request.result
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, {keyPath: 'id'})
            }
            if (!db.objectStoreNames.contains(DEAD_STORE_NAME)) {
                db.createObjectStore(DEAD_STORE_NAME, {keyPath: 'id'})
            }
        }
        request.onsuccess = () => {
            if (settled) {
                // We already rejected (blocked); don't leak the connection that arrived late.
                request.result.close()
                return
            }
            settled = true
            resolve(request.result)
        }
        request.onerror = () => {
            if (settled) return
            settled = true
            reject(request.error ?? new Error('indexedDB.open failed'))
        }
        request.onblocked = () => {
            if (settled) return
            settled = true
            reject(new Error('indexedDB.open blocked by another open connection'))
        }
    })
}

/**
 * Run a single request inside its own transaction.
 *
 * The promise settles on the **transaction**, never on the request: `oncomplete` is the only point
 * at which a write is actually durable (a request can report success and still be rolled back if the
 * transaction later aborts), and `onabort`/`onerror` guarantee the promise settles even when the
 * request-level handler never fires.
 */
async function withStore<T>(
    storeName: string,
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
    const db = await openDb()
    try {
        return await new Promise<T>((resolve, reject) => {
            const tx = db.transaction(storeName, mode)
            let outcome: {value: T} | undefined
            let settled = false
            const fail = (error: unknown) => {
                if (settled) return
                settled = true
                reject(error instanceof Error ? error : new Error(String(error)))
            }

            const request = run(tx.objectStore(storeName))
            request.onsuccess = () => {
                outcome = {value: request.result}
            }
            request.onerror = () => fail(request.error ?? new Error('IndexedDB request failed'))
            tx.oncomplete = () => {
                if (settled) return
                settled = true
                if (outcome === undefined) {
                    reject(new Error('IndexedDB transaction completed without a result'))
                    return
                }
                resolve(outcome.value)
            }
            tx.onabort = () => fail(tx.error ?? new Error('IndexedDB transaction aborted'))
            tx.onerror = () => fail(tx.error ?? new Error('IndexedDB transaction failed'))
        })
    } finally {
        db.close()
    }
}

/**
 * Write a mark into the queue. Also used to update an existing entry in place (same `id`), e.g. to
 * bump `attempts` after a retryable failure.
 */
export async function enqueue(item: PendingTimeMark): Promise<void> {
    await withStore(STORE_NAME, 'readwrite', store => store.put(item))
}

/**
 * Drop a mark from the queue. Called once the server has durably accepted it — this is the second
 * half of the write-ahead protocol, and the only thing that ever shortens the queue on success.
 */
export async function remove(id: string): Promise<void> {
    await withStore(STORE_NAME, 'readwrite', store => store.delete(id))
}

/**
 * Move a permanently-failed mark from the pending store to the dead-letter store, atomically: both
 * operations share one transaction, so the item can never be lost (deleted but not stored) nor
 * duplicated (stored but not deleted).
 */
async function moveToDead(item: PendingTimeMark): Promise<void> {
    const db = await openDb()
    try {
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction([STORE_NAME, DEAD_STORE_NAME], 'readwrite')
            let settled = false
            const fail = (error: unknown) => {
                if (settled) return
                settled = true
                reject(error instanceof Error ? error : new Error(String(error)))
            }

            tx.objectStore(DEAD_STORE_NAME).put(item)
            tx.objectStore(STORE_NAME).delete(item.id)
            tx.oncomplete = () => {
                if (settled) return
                settled = true
                resolve()
            }
            tx.onabort = () => fail(tx.error ?? new Error('IndexedDB transaction aborted'))
            tx.onerror = () => fail(tx.error ?? new Error('IndexedDB transaction failed'))
        })
    } finally {
        db.close()
    }
}

export async function counts(): Promise<QueueCounts> {
    const [pending, dead] = await Promise.all([
        withStore<number>(STORE_NAME, 'readonly', store => store.count()),
        withStore<number>(DEAD_STORE_NAME, 'readonly', store => store.count()),
    ])
    return {pending, dead}
}

/**
 * Drains never run concurrently: a 15s tick (or any other trigger) that fires while a previous drain
 * is still in flight is a no-op — it just reports the counts as of right now instead of starting a
 * second pass over the same items.
 *
 * Held as a *timestamp* rather than a boolean so a latch that somehow leaked (a `finally` that never
 * ran because the tab was frozen mid-await, say) cannot disable the queue for the rest of the
 * session: after `DRAIN_STALE_MILLIS` the next caller logs and takes the latch anyway.
 */
let drainingSince: number | null = null
const DRAIN_STALE_MILLIS = 60_000

function nextAttempts(item: PendingTimeMark): number {
    // Items written under DB_VERSION 1 have no `attempts` field at all.
    const current: unknown = item.attempts
    return typeof current === 'number' ? current + 1 : 1
}

function normalizeResult(result: PostResult): {outcome: PostOutcome; status?: number} {
    return typeof result === 'string' ? {outcome: result} : result
}

/**
 * Attempt to (re-)submit every queued mark via `post`, regardless of which event/station is
 * currently shown on the board — the caller decides, per item, whether it applies to the current
 * board (e.g. to call `markSaved`).
 *
 * Per item: `ok` deletes it, `retryable` keeps it with `attempts` incremented, `permanent` moves it
 * to the dead-letter store. A `post` that throws counts as `retryable`, and a failing IndexedDB
 * write for one item is logged but never aborts the pass — that item simply stays queued and is
 * reflected in the returned counts, which are always re-read from the database.
 */
export async function drain(
    post: (item: PendingTimeMark) => Promise<PostResult>,
): Promise<QueueCounts> {
    const startedAt = Date.now()
    if (drainingSince !== null) {
        const heldFor = startedAt - drainingSince
        if (heldFor < DRAIN_STALE_MILLIS) return counts()
        console.warn(
            `[timing] offline queue drain latch held for ${heldFor}ms — assuming a leaked latch and resetting`,
        )
    }
    drainingSince = startedAt
    try {
        const items = await withStore<PendingTimeMark[]>(STORE_NAME, 'readonly', store =>
            store.getAll(),
        )
        for (const item of items) {
            let outcome: PostOutcome
            let status: number | undefined
            try {
                const result = normalizeResult(await post(item))
                outcome = result.outcome
                status = result.status
            } catch (error) {
                console.warn('[timing] offline queue post threw, keeping item queued', error)
                outcome = 'retryable'
            }

            // One item's IndexedDB failure must not stop the others from draining.
            try {
                if (outcome === 'ok') {
                    await remove(item.id)
                } else {
                    const updated: PendingTimeMark = {
                        ...item,
                        attempts: nextAttempts(item),
                        lastStatus: status ?? item.lastStatus,
                    }
                    if (outcome === 'permanent') {
                        await moveToDead(updated)
                    } else {
                        await enqueue(updated)
                    }
                }
            } catch (error) {
                console.warn(
                    `[timing] offline queue bookkeeping failed for mark ${item.id} (outcome ${outcome}) — item stays queued`,
                    error,
                )
            }
        }
        return await counts()
    } finally {
        drainingSince = null
    }
}
