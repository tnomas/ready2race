package de.lambda9.ready2race.backend.app.timing.entity

import java.util.UUID

data class TimingSequenceDto(
    val id: UUID,
    val event: UUID,
    val station: UUID,
    val mode: SequenceMode,
    val intervalMillis: Long?,
    val leadInMillis: Long,
    val state: SequenceState,
    val startedAtMillis: Long?,
    /**
     * Beginn der laufenden Pause (Server-Epoch-Millis), oder `null`, wenn die Sequenz gerade
     * nicht angehalten ist. Nur bei [SequenceState.PAUSED] gesetzt - Boards und Startbildschirm
     * können daraus anzeigen, wie lange schon gewartet wird, ohne selbst mitzuzählen.
     */
    val pausedAtMillis: Long?,
    val entries: List<TimingSequenceEntryDto>,
)
