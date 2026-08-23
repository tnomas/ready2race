package de.lambda9.ready2race.backend.app.timing.entity

import java.time.LocalDateTime
import java.util.UUID

/**
 * One row of the Leitstand's result table.
 *
 * [startMillis] / [finishMillis] are resolved from the team's currently assigned, non-retracted
 * marks (not stored) so the board can show what a recompute would use, next to what the stored
 * official time actually says.
 *
 * [effectiveMillis] is the value a push writes: `(overrideMillis ?: computedMillis) + penaltyMillis`,
 * or null when there is no base time or when [resultStatus] is not
 * [OfficialTimeResultStatus.NONE].
 */
data class OfficialTimeDto(
    val competitionMatchTeam: UUID,
    val event: UUID,
    val startMillis: Long?,
    val finishMillis: Long?,
    val computedMillis: Long?,
    val overrideMillis: Long?,
    val penaltyMillis: Long,
    /** Freitext-Grund zur Strafe; wird mit der Rückschreibung als `penalty_note` ans Team übertragen. */
    val penaltyNote: String?,
    val resultStatus: OfficialTimeResultStatus,
    val effectiveMillis: Long?,
    val dirty: Boolean,
    val pushedAt: LocalDateTime?,
)
