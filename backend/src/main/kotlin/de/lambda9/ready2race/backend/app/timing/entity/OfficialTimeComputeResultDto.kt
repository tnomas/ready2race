package de.lambda9.ready2race.backend.app.timing.entity

import java.util.UUID

/**
 * Outcome of a recompute: the official times that were written, and every team that could not be
 * computed together with the reason - the Leitstand shows those so an operator can fix the marks
 * instead of wondering why a team has no time.
 */
data class OfficialTimeComputeResultDto(
    val computed: List<OfficialTimeDto>,
    val skipped: List<OfficialTimeSkipDto>,
)

data class OfficialTimeSkipDto(
    val competitionMatchTeam: UUID,
    val reason: OfficialTimeSkipReason,
)

enum class OfficialTimeSkipReason {
    /** Marks exist, but none on a START station - the difference cannot be formed. */
    NO_START_MARK,

    /** Started but not finished yet (or the finish mark was retracted). */
    NO_FINISH_MARK,

    /** The finish mark lies before the start mark - the marks are wrong, not the team. */
    NEGATIVE_DURATION,
}
