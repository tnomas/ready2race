package de.lambda9.ready2race.backend.app.material.entity

import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult
import java.util.UUID

data class MaterialAssignmentEntry(
    val materialItem: UUID,
    val competitionMatch: UUID?,
)

/**
 * Vollständige Zuteilung einer Anfrage - kein Delta, jeder Aufruf ersetzt die bisherigen
 * Zuteilungen (Regeln in [de.lambda9.ready2race.backend.app.material.boundary.MaterialService.setAssignments]).
 */
class MaterialAssignmentsRequest(
    val assignments: List<MaterialAssignmentEntry>,
) : Validatable {
    override fun validate(): ValidationResult = ValidationResult.Valid

    companion object {
        val example
            get() = MaterialAssignmentsRequest(assignments = listOf(MaterialAssignmentEntry(UUID.randomUUID(), null)))
    }
}
