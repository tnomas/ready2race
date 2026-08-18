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
    val entries: List<TimingSequenceEntryDto>,
)
