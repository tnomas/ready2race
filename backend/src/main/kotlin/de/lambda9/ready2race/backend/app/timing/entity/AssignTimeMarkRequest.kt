package de.lambda9.ready2race.backend.app.timing.entity

import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult
import java.util.UUID

data class AssignTimeMarkRequest(
    val competitionMatchTeam: UUID?,
) : Validatable {
    override fun validate(): ValidationResult = ValidationResult.Valid

    companion object {
        val example get() = AssignTimeMarkRequest(
            competitionMatchTeam = UUID.randomUUID(),
        )
    }
}
