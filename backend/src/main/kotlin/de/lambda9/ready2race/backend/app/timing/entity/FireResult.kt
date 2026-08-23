package de.lambda9.ready2race.backend.app.timing.entity

import java.util.UUID

/**
 * What a single [de.lambda9.ready2race.backend.app.timing.boundary.TimingSequenceService.fireDueEntries]
 * run changed.
 *
 * The run itself must not broadcast: it executes inside the scheduler's transaction, where no
 * `AfterCommit` buffer is installed, so a broadcast registered there would go out before the commit.
 * Everything a websocket message needs is therefore carried out of the transaction in this value and
 * flushed afterwards by
 * [de.lambda9.ready2race.backend.app.timing.boundary.TimingSequenceService.broadcastFireResult].
 */
data class FireResult(
    val fired: List<FiredEntry>,
    /**
     * Every sequence whose state the run changed, re-read after the changes were applied - entries
     * fired and/or the sequence completed. Ready to be sent as a sequence-level websocket message.
     */
    val changedSequences: List<TimingSequenceDto>,
) {
    companion object {
        val empty get() = FireResult(emptyList(), emptyList())
    }
}

data class FiredEntry(
    val sequenceId: UUID,
    val entryId: UUID,
    /** The start mark that was created, already carrying its team assignment. */
    val mark: TimeMarkDto,
    /**
     * Offizielle Zeiten, die die Echtzeit-Übernahme beim Feuern dieses Eintrags geändert hat -
     * aus demselben Grund hier statt als Broadcast: die Nachricht darf erst nach dem Commit raus.
     */
    val changedOfficialTimes: List<OfficialTimeDto> = emptyList(),
    /**
     * Ob dieses Feuern den Laufzustand der Partie gestempelt hat (started_at, ggf. activated_at).
     * Auch das darf erst nach dem Commit nach draußen - als `EventChangeMarker`-Bump in
     * `broadcastFireResult`, damit die öffentlichen Anzeigen den neuen Zustand sofort nachladen.
     */
    val matchStamped: Boolean = false,
)
