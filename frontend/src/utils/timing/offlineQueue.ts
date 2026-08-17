/**
 * Offline buffer for time marks whose `createTimeMark` POST failed (no network, or a non-2xx
 * response). Hand-rolled IndexedDB (db `r2r-timing`, store `pendingTimeMarks`, keyPath `id`) — no
 * new dependencies. Survives reload/app-restart by design: a mark captured while offline is queued
 * here and retried once connectivity returns, from whichever board happens to be open then.
 *
 * The queue is global by design: it is not scoped to one event. A mark captured on this device for
 * event A must still be drained and posted even if the board now shows event B — see `drain`.
 */
export type PendingTimeMark = {
    id: string
    eventId: string
    station: string
    timestampMillis: number
}

const DB_NAME = 'r2r-timing'
const DB_VERSION = 1
const STORE_NAME = 'pendingTimeMarks'

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION)
        request.onupgradeneeded = () => {
            const db = request.result
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, {keyPath: 'id'})
            }
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })
}

async function withStore<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
    const db = await openDb()
    try {
        return await promisify(run(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME)))
    } finally {
        db.close()
    }
}

export async function enqueue(item: PendingTimeMark): Promise<void> {
    await withStore('readwrite', store => store.put(item))
}

export async function count(): Promise<number> {
    return withStore('readonly', store => store.count())
}

// Drains never run concurrently: a 15s tick (or any other trigger) that fires while a previous
// drain is still in flight is a no-op — it just reports the count as of right now instead of
// starting a second pass over the same items.
let draining = false

/**
 * Attempt to (re-)submit every queued mark via `post`, regardless of which event/station is
 * currently shown on the board — the caller decides, per item, whether it applies to the current
 * board (e.g. to call `markSaved`). Items whose `post` resolves `true` are deleted; items that
 * resolve `false` are kept for the next drain. Returns the number of items still queued afterwards.
 */
export async function drain(post: (item: PendingTimeMark) => Promise<boolean>): Promise<number> {
    if (draining) return count()
    draining = true
    try {
        const items = await withStore<PendingTimeMark[]>('readonly', store => store.getAll())
        for (const item of items) {
            const success = await post(item)
            if (success) {
                await withStore('readwrite', store => store.delete(item.id))
            }
        }
        return await count()
    } finally {
        draining = false
    }
}
