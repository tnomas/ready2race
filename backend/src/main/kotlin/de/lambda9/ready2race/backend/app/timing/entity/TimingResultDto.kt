package de.lambda9.ready2race.backend.app.timing.entity

import java.util.UUID

/**
 * One row of the Leitstand's result table.
 *
 * Nothing here is stored: [startMillis]/[finishMillis] come from the team's currently assigned,
 * non-retracted marks and [computedFinalMillis] is derived from them plus the penalty on the team.
 * That is the whole point of dropping the old `timing_official_time` table - the view recomputes
 * live, so a corrected mark shows its effect immediately instead of waiting for a "recompute"
 * button, and there is no second copy of a time that can silently disagree with the marks.
 *
 * [computedFinalMillis] is `(finish - start) + penaltySeconds * 1000` and null whenever
 * [skipReason] says why it cannot be formed, or whenever [resultStatus] is not
 * [TimingResultStatus.NONE] (a status supersedes any time).
 */
data class TimingResultDto(
    val competitionMatchTeam: UUID,
    val event: UUID,
    val competitionMatch: UUID,
    val startMillis: Long?,
    val finishMillis: Long?,
    /** `finish - start`, before the penalty is added - what the marks alone say. */
    val measuredMillis: Long?,
    val penaltySeconds: Int?,
    val penaltyNote: String?,
    val resultStatus: TimingResultStatus,
    val computedFinalMillis: Long?,
    val skipReason: TimingResultSkipReason?,
    /**
     * Whether the results flow already carries what a push would write. There is no `pushed_at`
     * column anywhere: a pushed time IS `competition_match_team.timecode`, and a pushed status IS
     * `failed` + `failed_reason` - so the presence of those values is the flag.
     */
    val pushed: Boolean,
    /** `places_calculated || place != null || failed` - a push needs `force` past this. */
    val frozen: Boolean,
)

/** Why a team has no computable final time, or why "push everything" left it out. */
enum class TimingResultSkipReason {
    /** No marks at all - nothing to compute from. */
    NO_MARKS,

    /** Marks exist, but none on a START station - the difference cannot be formed. */
    NO_START_MARK,

    /** Started but not finished yet (or the finish mark was retracted). */
    NO_FINISH_MARK,

    /** The finish mark lies before the start mark - the marks are wrong, not the team. */
    NEGATIVE_DURATION,

    /**
     * "Push everything" only: the team has a place recorded (`place`, or places calculated), the
     * same freeze an explicit push answers with [PushConflictReason.RESULT_FROZEN]. Push-all does
     * not fail the batch over it - the team is left out and reported here instead.
     */
    RESULT_FROZEN,

    /**
     * "Push everything" only: the team is `failed` (a DNS/DNF/DSQ status was entered) but has no
     * place recorded. Unlike [RESULT_FROZEN] this alone must not block the rest of the batch - a
     * status is itself a recorded outcome, not a boat still on the water, so push-all leaves it out
     * rather than treating it as a conflict.
     */
    STATUS_SET,
}

data class TimingResultSkipDto(
    val competitionMatchTeam: UUID,
    val reason: TimingResultSkipReason,
)
