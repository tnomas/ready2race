package de.lambda9.ready2race.backend.app.timing.entity

import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult
import de.lambda9.ready2race.backend.validation.validate
import de.lambda9.ready2race.backend.validation.validators.CollectionValidators.noDuplicates
import java.util.UUID

/**
 * Which teams to recompute. Absent or `null` recomputes the whole event - the usual "Neu
 * berechnen" action on the Leitstand - while a list restricts the recompute to those teams (e.g.
 * a single-team retry after fixing a mark).
 */
data class ComputeOfficialTimesRequest(
    val teams: List<UUID>? = null,
) : Validatable {

    override fun validate(): ValidationResult =
        this::teams validate noDuplicates

    companion object {
        val example
            get() = ComputeOfficialTimesRequest(
                teams = null,
            )
    }
}
