package de.lambda9.ready2race.backend.app.material.entity

import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult
import java.util.UUID

/**
 * Vollständige Liste der gewünschten Angebote einer Meldung - kein Delta, jeder Aufruf ersetzt
 * den bisherigen Stand (Regeln in [de.lambda9.ready2race.backend.app.material.boundary.MaterialService.setRequestsForRegistration]).
 */
class MaterialRequestsUpsertRequest(
    val offerIds: List<UUID>,
) : Validatable {
    override fun validate(): ValidationResult = ValidationResult.Valid

    companion object {
        val example get() = MaterialRequestsUpsertRequest(offerIds = listOf(UUID.randomUUID()))
    }
}
