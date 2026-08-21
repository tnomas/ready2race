package de.lambda9.ready2race.backend.app.timing.entity

import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult
import de.lambda9.ready2race.backend.validation.validate
import de.lambda9.ready2race.backend.validation.validators.CollectionValidators.noDuplicates
import de.lambda9.ready2race.backend.validation.validators.CollectionValidators.notEmpty
import java.util.UUID

/**
 * Which teams' official times to write into the results flow.
 *
 * [force] only overrides the freeze boundary ([PushConflictReason.RESULT_FROZEN]); a team without an
 * effective time can never be pushed because there is nothing to write.
 */
data class PushOfficialTimesRequest(
    val teams: List<UUID>,
    val force: Boolean = false,
) : Validatable {

    override fun validate(): ValidationResult = ValidationResult.allOf(
        this::teams validate notEmpty,
        this::teams validate noDuplicates,
    )

    companion object {
        val example
            get() = PushOfficialTimesRequest(
                teams = listOf(UUID.randomUUID()),
                force = false,
            )
    }
}

data class OfficialTimePushConflictDto(
    val competitionMatchTeam: UUID,
    val reason: PushConflictReason,
)

enum class PushConflictReason {
    /**
     * The team's result is already recorded in the results flow (a place was entered, or places were
     * calculated). Approval is the freeze boundary: the pushed `timecode` is a snapshot, so
     * overwriting it silently would change an approved result.
     */
    RESULT_FROZEN,

    /** Neither a computed nor an overridden time, and no DNS/DNF/DSQ status - nothing to write. */
    NO_EFFECTIVE_TIME,
}
