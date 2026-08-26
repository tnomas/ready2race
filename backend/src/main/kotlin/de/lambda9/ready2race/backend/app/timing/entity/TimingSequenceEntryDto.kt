package de.lambda9.ready2race.backend.app.timing.entity

import java.util.UUID

data class TimingSequenceEntryDto(
    val id: UUID,
    val competitionMatchTeam: UUID,
    val position: Int,
    val status: SequenceEntryStatus,
    /**
     * Wall-clock instant (server epoch millis) this entry is scheduled to fire at, or `null` while
     * the sequence has not been started yet. Boards render their countdowns from this value plus
     * their server-clock offset, so it is the single source of truth for "when".
     */
    val plannedStartMillis: Long?,
    val timeMark: UUID?,
)
