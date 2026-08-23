package de.lambda9.ready2race.backend.app.timing.entity

import java.util.UUID

/**
 * Eine Zuordnung Zeitnahmetyp -> Wettkampf und/oder Runde. Ohne Runde gilt der Typ für den ganzen
 * Wettkampf; ein Eintrag mit Runde übersteuert ihn für genau diese Runde.
 */
data class TimingModeAssignmentDto(
    val id: UUID,
    val competition: UUID,
    val competitionSetupRound: UUID?,
    val timingMode: UUID,
)
