package de.lambda9.ready2race.backend.app.timing.entity

import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult
import de.lambda9.ready2race.backend.validation.validate
import de.lambda9.ready2race.backend.validation.validators.CollectionValidators.noDuplicates
import de.lambda9.ready2race.backend.validation.validators.CollectionValidators.notEmpty
import java.util.UUID

/**
 * Which teams' computed results to write into the results flow.
 *
 * Two shapes, deliberately different in strictness:
 *
 * - **[teams] given** ("push these"): every named team must be pushable. A team without a final time
 *   and without a status is a [PushConflictReason.NO_FINAL_TIME] conflict, because the operator
 *   asked for something that cannot be done.
 * - **[teams] null** ("push everything"): the pushable teams of the event are pushed and the rest is
 *   reported as skipped. A half-timed event is the normal state of a running regatta, so refusing
 *   the whole push because some boats are still on the water would make the button useless.
 *
 * In both shapes a frozen team is a hard conflict that fails the WHOLE call (nothing is written), so
 * an operator never ends up with half a round pushed. [force] overrides that freeze - and only that;
 * it never makes a team without a final time pushable.
 */
data class PushTimingResultsRequest(
    val teams: List<UUID>? = null,
    val force: Boolean = false,
) : Validatable {

    override fun validate(): ValidationResult = ValidationResult.allOf(
        this::teams validate notEmpty,
        this::teams validate noDuplicates,
    )

    companion object {
        val example
            get() = PushTimingResultsRequest(
                teams = listOf(UUID.randomUUID()),
                force = false,
            )
    }
}

data class TimingResultPushConflictDto(
    val competitionMatchTeam: UUID,
    val reason: PushConflictReason,
)

enum class PushConflictReason {
    /**
     * The team's result is already recorded in the results flow: a place was entered, places were
     * calculated, or the team is flagged failed. Any of the three means somebody has already worked
     * with this result, so overwriting its `timecode` snapshot silently would change an approved
     * result - the push refuses unless it is forced.
     */
    RESULT_FROZEN,

    /** Neither a computable time nor a DNS/DNF/DSQ status - there is nothing to write. */
    NO_FINAL_TIME,

    /**
     * The team's competition is not timed with this application (its effective timing system is not
     * READY2RACE). Never forceable: internal timing has no measurement of this boat at all, and
     * writing one would overwrite what its actual timing source produced.
     */
    WRONG_TIMING_SYSTEM,
}

/**
 * Outcome of a push: what was written, and every team that was left out with the reason - the
 * Leitstand shows those so an operator can fix the marks instead of wondering why a boat has no
 * result.
 */
data class TimingResultPushResultDto(
    val pushed: List<TimingResultDto>,
    val skipped: List<TimingResultSkipDto>,
)
