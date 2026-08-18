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
 * banner, from which they can be inspected and either requeued (`requeueDead`) or explicitly
 * discarded (`discardDead`) — a dead letter is a decision for the operator, never a dead end.
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
    /**
     * Team this capture was made *for*, when it came from the direct-tap team grid (capture and
     * assignment are one operator gesture there). Purely additive and **optional**: two-step captures
     * never set it, and items written before this field existed simply don't have it — which is why
     * this needs no `DB_VERSION` bump, the store's shape is unchanged as far as IndexedDB is
     * concerned. Consumers must treat `undefined` as "no assignment to make".
     *
     * The assignment is a *second* request (PUT .../assignment) that can only run once the mark POST
     * succeeded, so it is deliberately not part of the mark's own payload: the queue's durability
     * guarantee covers the mark (the thing that is irreplaceable), while a failed assignment merely
     * leaves the mark unassigned and falls back to the ordinary two-step assignment UI.
     */
    competitionMatchTeam?: string
}

/**
 * Result of a single `post` attempt:
 * - `ok` — the server accepted the mark; the item is removed from the queue.
 * - `retryable` — transient (network error, 5xx, or a 4xx that a later attempt can pass); the item
 *   is kept and retried later.
 * - `permanent` — retrying can never succeed (the request itself is semantically rejected); the item
 *   is moved to the dead-letter store.
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
 * 4xx statuses that say "this attempt failed" rather than "this request is wrong", and must therefore
 * keep the item queued:
 * - 401/403 — the *session* is the problem, not the mark. An expired session (very common: the board
 *   is left open on a phone all morning) would otherwise dead-letter the entire queue on the next
 *   drain, destroying captured times that a re-login would have submitted just fine.
 * - 408/429 — explicitly "come back later".
 * - 409 — defensive: a conflict against a concurrent write is not a property of this request, and the
 *   idempotent re-POST either succeeds or comes back with a status that classifies properly.
 * - 425 — the server asks for the request to be replayed.
 */
const RETRYABLE_CLIENT_STATUSES = new Set([401, 403, 408, 409, 425, 429])

/**
 * Classify an HTTP status into a drain outcome. Only a semantic rejection of the request itself
 * (400 bad request, 404 unknown event, 422 unprocessable, …) is `permanent`; everything else —
 * network-level failures, 5xx, and the client statuses listed in `RETRYABLE_CLIENT_STATUSES` — stays
 * queued. Dead-lettering is the destructive branch, so it is deliberately the narrow one.
 */
export function classifyStatus(status: number): Exclude<PostOutcome, 'ok'> {
    if (status >= 400 && status < 500) {
        return RETRYABLE_CLIENT_STATUSES.has(status) ? 'retryable' : 'permanent'
    }
    return 'retryable'
}

/** Marker for the `onblocked` rejection, so `openDb` can tell it apart from a real failure. */
class BlockedError extends Error {
    constructor() {
        super('indexedDB.open blocked by another open connection')
        this.name = 'BlockedError'
    }
}

const BLOCKED_RETRY_MILLIS = 250

/**
 * Open (and, on a version bump, upgrade) the database. Every terminal event settles the promise —
 * including `onblocked`, which fires when another tab still holds the DB open at the old version and
 * would otherwise leave the caller hanging forever.
 */
function openDbOnce(): Promise<IDBDatabase> {
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
            reject(new BlockedError())
        }
    })
}

/**
 * `openDbOnce`, but a `blocked` result is retried once after a short delay. Blocking is usually
 * momentary — another tab of the same board holding the old version open, whose `onversionchange`
 * close is already on its way — so failing the very first attempt would drop captures for a race that
 * resolves itself within a few milliseconds. Exactly one retry: if a second tab is genuinely sitting
 * on the old version, the caller must hear about it rather than block behind an unbounded wait.
 */
async function openDb(): Promise<IDBDatabase> {
    try {
        return await openDbOnce()
    } catch (error) {
        if (!(error instanceof BlockedError)) throw error
        console.warn(
            `[timing] indexedDB.open blocked — retrying once in ${BLOCKED_RETRY_MILLIS}ms`,
            error,
        )
        await new Promise<void>(resolve => setTimeout(resolve, BLOCKED_RETRY_MILLIS))
        return await openDbOnce()
    }
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
 * Record the outcome of a failed drain attempt, as a single **read-modify-write** transaction spanning
 * both stores.
 *
 * The read matters: between `drain`'s `getAll` and this write, the item's own capture flow may have
 * had its POST confirmed and called `remove(id)` (the capture and the drain can be in flight against
 * the same mark at the same time — the capture POSTs directly while the drain re-POSTs from the
 * queue). Writing unconditionally would then resurrect a mark the server already has: the retryable
 * branch would re-`put` the deleted row so it is posted forever, and the permanent branch would
 * dead-letter a mark that in fact succeeded, showing the operator a scary "could not be submitted"
 * banner for a time that is safely stored. So the transaction first re-reads the row and, if it is
 * gone, writes nothing at all and reports `false`.
 *
 * When the row is still there, the two writes of the dead-letter move share this one transaction, so
 * the item can never be lost (deleted but not stored) nor duplicated (stored but not deleted).
 */
async function commitFailedAttempt(
    updated: PendingTimeMark,
    outcome: Exclude<PostOutcome, 'ok'>,
): Promise<boolean> {
    const db = await openDb()
    try {
        return await new Promise<boolean>((resolve, reject) => {
            const tx = db.transaction([STORE_NAME, DEAD_STORE_NAME], 'readwrite')
            let settled = false
            let written = false
            const fail = (error: unknown) => {
                if (settled) return
                settled = true
                reject(error instanceof Error ? error : new Error(String(error)))
            }

            const pending = tx.objectStore(STORE_NAME)
            const existing = pending.get(updated.id)
            existing.onsuccess = () => {
                // Gone — the capture flow's own POST won the race and already cleaned up.
                if ((existing.result as PendingTimeMark | undefined) === undefined) return
                written = true
                if (outcome === 'permanent') {
                    tx.objectStore(DEAD_STORE_NAME).put(updated)
                    pending.delete(updated.id)
                } else {
                    pending.put(updated)
                }
            }
            existing.onerror = () => fail(existing.error ?? new Error('IndexedDB request failed'))
            tx.oncomplete = () => {
                if (settled) return
                settled = true
                resolve(written)
            }
            tx.onabort = () => fail(tx.error ?? new Error('IndexedDB transaction aborted'))
            tx.onerror = () => fail(tx.error ?? new Error('IndexedDB transaction failed'))
        })
    } finally {
        db.close()
    }
}

/** Every dead letter, for the recovery dialog. Insertion order; the caller sorts if it cares. */
export async function listDead(): Promise<PendingTimeMark[]> {
    return withStore<PendingTimeMark[]>(DEAD_STORE_NAME, 'readonly', store => store.getAll())
}

/**
 * Move every dead letter back into the pending queue with `attempts` reset, so the next `drain`
 * treats them as fresh. One transaction over both stores, so a requeue is all-or-nothing: no item can
 * end up in both stores or in neither. `lastStatus` is dropped along with `attempts` — it describes
 * the failed history, not the new attempt.
 *
 * The usual reason a requeue is what the operator wants: the marks were dead-lettered by a status
 * that *was* their fault at the time (a 404 while the event was still being set up, say) and the
 * underlying cause has since been fixed. Returns the number of items moved.
 *
 * The rebuilt row lists its fields explicitly (rather than spreading) so the reset of `attempts` and
 * `lastStatus` is visible — which means every *carried* field has to be named here too, including
 * `competitionMatchTeam`: dropping it would silently turn a direct-tap capture into an unassigned one.
 */
export async function requeueDead(): Promise<number> {
    const db = await openDb()
    try {
        return await new Promise<number>((resolve, reject) => {
            const tx = db.transaction([STORE_NAME, DEAD_STORE_NAME], 'readwrite')
            let settled = false
            let moved = 0
            const fail = (error: unknown) => {
                if (settled) return
                settled = true
                reject(error instanceof Error ? error : new Error(String(error)))
            }

            const dead = tx.objectStore(DEAD_STORE_NAME)
            const pending = tx.objectStore(STORE_NAME)
            const all = dead.getAll()
            all.onsuccess = () => {
                for (const item of all.result as PendingTimeMark[]) {
                    pending.put({
                        id: item.id,
                        eventId: item.eventId,
                        station: item.station,
                        timestampMillis: item.timestampMillis,
                        competitionMatchTeam: item.competitionMatchTeam,
                        attempts: 0,
                    })
                    dead.delete(item.id)
                    moved++
                }
            }
            all.onerror = () => fail(all.error ?? new Error('IndexedDB request failed'))
            tx.oncomplete = () => {
                if (settled) return
                settled = true
                resolve(moved)
            }
            tx.onabort = () => fail(tx.error ?? new Error('IndexedDB transaction aborted'))
            tx.onerror = () => fail(tx.error ?? new Error('IndexedDB transaction failed'))
        })
    } finally {
        db.close()
    }
}

/**
 * Delete every dead letter. This is the only path that ever destroys a captured time, so it must only
 * ever be reached through an explicit operator confirmation — the queue itself never drops anything.
 */
export async function discardDead(): Promise<void> {
    await withStore(DEAD_STORE_NAME, 'readwrite', store => store.clear())
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

/**
 * Ownership token for the latch above. Every drain that takes the latch claims the next generation,
 * and only releases the latch in its `finally` if it still holds the current one.
 *
 * Without this, latch stealing is unsafe: once the watchdog hands the latch to a second drain, the
 * *first* drain (which was merely slow, not dead — a frozen tab resumes) eventually reaches its own
 * `finally` and clears `drainingSince`, releasing a latch it no longer owns. A third drain would then
 * start while the second is still mid-pass, which is exactly the concurrent double-POST the latch
 * exists to prevent.
 */
let drainGeneration = 0

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
 * to the dead-letter store — the latter two via `commitFailedAttempt`, which skips the write entirely
 * if the item has meanwhile left the queue. A `post` that throws counts as `retryable`, and a failing
 * IndexedDB write for one item is logged but never aborts the pass — that item simply stays queued
 * and is reflected in the returned counts, which are always re-read from the database.
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
    const generation = ++drainGeneration
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
                    const written = await commitFailedAttempt(updated, outcome)
                    if (!written) {
                        console.info(
                            `[timing] mark ${item.id} left the queue while this drain was posting it — skipping bookkeeping`,
                        )
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
        // Only release a latch we still own — see `drainGeneration`.
        if (drainGeneration === generation) drainingSince = null
    }
}
