import {useCallback} from 'react'
import {assignTimeMark, createTimeMark} from '@api/sdk.gen.ts'
import {ApiError, AssignTimeMarkRequest, TimeMarkDto, TimingStationDto} from '@api/types.gen.ts'
import {RequestResult} from '@hey-api/client-fetch'
import {playCaptureFeedback} from '@utils/timing/feedback.ts'
import {enqueue, PendingTimeMark, remove as removeQueued} from '@utils/timing/offlineQueue.ts'

/**
 * Record a time mark. Called with a team id by the direct-tap team grid (capture *and* assignment in
 * one operator gesture), and without one by the two-step capture button and the Space shortcut.
 */
export type CaptureFn = (competitionMatchTeam?: string) => void

/**
 * PUT the assignment of an already-created mark. Shared by the direct capture path and the offline
 * queue's drain, so both attach a team exactly the same way — and, importantly, treat a failure the
 * same way: the mark itself is safe, only its assignment is missing, and the ordinary two-step
 * assignment UI can still fix that.
 *
 * Never throws; returns whether the assignment stuck.
 */
export async function assignCapturedMark(
    eventId: string,
    timeMarkId: string,
    competitionMatchTeam: string,
): Promise<boolean> {
    try {
        // Same cast as `AssignTeamDialog`: the generated request type declares `competitionMatchTeam`
        // as optional, an artifact of the tsp-vs-yaml mismatch in the timing endpoints, while the
        // backend contract requires the field to be present.
        const {error} = await (assignTimeMark({
            path: {eventId, timeMarkId},
            body: {competitionMatchTeam} as unknown as AssignTimeMarkRequest,
        }) as unknown as RequestResult<void, ApiError, false>)
        return error === undefined
    } catch {
        return false
    }
}

export type UseCaptureFlowOptions = {
    eventId: string
    /** The current station, or undefined while the board's initial state load is still in flight. */
    station: TimingStationDto | undefined
    now: () => number | null
    applyLocalMark: (mark: TimeMarkDto) => void
    markSaved: (id: string) => void
    markFailed: (id: string) => void
    /**
     * Called exactly once per capture, right after the write-ahead enqueue attempt, with the mark's id
     * and whether it actually made it into the durable queue. `false` means this capture exists only
     * in memory and will be lost on reload — the board surfaces that as its own banner, because it is
     * a materially worse situation than "queued, not yet submitted".
     *
     * The id is part of the signature because the banner is per-mark, not a global flag: the board
     * tracks *which* captures are unbuffered and clears each one when that same id is later reported
     * to `markSaved`. A bare boolean cannot express either half of that.
     */
    onBuffered: (id: string, buffered: boolean) => void
    /**
     * Called whenever the capture flow changed the queue's contents, so the board page can refresh
     * its queue-status banner immediately instead of waiting for the next periodic drain/count check.
     */
    onQueueChanged: () => void
    /**
     * Called when a *combined* capture+assign got the mark through but not its assignment. The mark
     * stands; the board rolls its optimistic assignment back and tells the operator, who then assigns
     * it from the mark list like any two-step capture.
     */
    onAssignFailed?: (id: string) => void
}

/**
 * The board's one capture flow, ordered **write-ahead**: the mark is put into the durable offline
 * queue *before* the POST is attempted, and only removed again once the server has confirmed it. That
 * makes the queue the single durable record of a capture — a tab killed mid-POST loses nothing,
 * because the next drain re-POSTs the item and the server deduplicates by the mark's UUID. The old
 * order (POST first, enqueue only on failure) had a window in which a capture existed nowhere but
 * in memory.
 *
 * If the enqueue itself fails there is no durable record to fall back on, so the mark is flagged
 * `failed` and the board is told via `onBuffered(false)`; the POST is still attempted, because an
 * unbuffered capture that reaches the server is strictly better than one that does neither.
 *
 * This is also the path an unauthorized capture takes: nothing here special-cases the session, so
 * a 401 is just another failed POST — the mark stays queued and a later drain submits it.
 *
 * **Combined capture+assign.** With a `competitionMatchTeam`, the assignment rides along in the queued
 * item and is PUT right after the mark POST succeeds. The two steps are deliberately *not* symmetric:
 * the queue entry is dropped once the **mark** is stored, even if the assignment then fails, because
 * the queue exists to protect the irreplaceable half (a time that was physically observed once).
 * A failed assignment is recoverable at leisure through the two-step assignment UI, so it is reported
 * via `onAssignFailed` instead of keeping the item queued and re-POSTing the mark forever.
 *
 * Extracted from `CaptureButton` so the button, the Space shortcut and the team grid all share one
 * implementation rather than three copies of the write-ahead protocol.
 */
export function useCaptureFlow({
    eventId,
    station,
    now,
    applyLocalMark,
    markSaved,
    markFailed,
    onBuffered,
    onQueueChanged,
    onAssignFailed,
}: UseCaptureFlowOptions): CaptureFn {
    return useCallback(
        (competitionMatchTeam?: string) => {
            const ts = now()
            if (ts === null || station === undefined) return

            const id = crypto.randomUUID()
            const stationId = station.id
            const mark: TimeMarkDto = {
                id,
                event: eventId,
                station: stationId,
                timestampMillis: ts,
                source: 'APP_USER',
                status: 'ACTIVE',
                // Optimistic: shows the team on the mark (and marks it "finished" in the grid)
                // immediately, long before the assignment PUT has been answered.
                assignedTeam: competitionMatchTeam,
            }

            applyLocalMark(mark)
            playCaptureFeedback()

            void (async () => {
                const item: PendingTimeMark = {
                    id,
                    eventId,
                    station: stationId,
                    timestampMillis: ts,
                    competitionMatchTeam,
                    attempts: 0,
                }

                // Step 1: write-ahead into the durable queue.
                let buffered = true
                try {
                    await enqueue(item)
                } catch (error) {
                    buffered = false
                    console.warn(
                        `[timing] Zeitstempel ${id} konnte nicht gepuffert werden — Erfassung existiert nur im Speicher`,
                        error,
                    )
                    markFailed(id)
                }
                onBuffered(id, buffered)
                onQueueChanged()

                // Step 2: POST. Attempted even when step 1 failed.
                try {
                    const {error} = await createTimeMark({
                        path: {eventId},
                        body: {id, station: stationId, timestampMillis: ts},
                    })
                    if (error !== undefined) {
                        // Left in the queue on purpose — the banner picks it up and the next drain
                        // retries (or dead-letters) it based on the response status it sees then. The
                        // queued item still carries the team, so that drain assigns it too.
                        markFailed(id)
                        return
                    }
                    markSaved(id)
                } catch {
                    markFailed(id)
                    return
                }

                // Step 3: the assignment half of a direct-tap capture.
                if (competitionMatchTeam !== undefined) {
                    const assigned = await assignCapturedMark(eventId, id, competitionMatchTeam)
                    if (!assigned) {
                        console.warn(
                            `[timing] Zeitstempel ${id} wurde gespeichert, die Team-Zuordnung schlug jedoch fehl`,
                        )
                        onAssignFailed?.(id)
                    }
                }

                // Confirmed by the server: the queue entry has done its job.
                try {
                    await removeQueued(id)
                } catch (error) {
                    console.warn(
                        `[timing] Zeitstempel ${id} wurde übertragen, konnte aber nicht aus der Warteschlange entfernt werden — der nächste Drain räumt auf`,
                        error,
                    )
                }
                onQueueChanged()
            })()
        },
        [
            now,
            station,
            eventId,
            applyLocalMark,
            markSaved,
            markFailed,
            onBuffered,
            onQueueChanged,
            onAssignFailed,
        ],
    )
}
