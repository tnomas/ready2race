package de.lambda9.ready2race.backend.app.appuser.entity

import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult
import java.util.UUID

/**
 * Ordnet einen Nutzer einem Materialanbieter zu, oder löst die Zuordnung mit `null` wieder.
 * Die Einladung selbst kennt keinen Anbieter - das ordnet der Admin erst nach dem Anlegen des
 * Nutzers zu (bewusste Entscheidung, siehe Task 1.6).
 */
data class SetMaterialProviderRequest(
    val materialProviderId: UUID?,
) : Validatable {
    override fun validate(): ValidationResult = ValidationResult.Valid

    companion object {
        val example
            get() = SetMaterialProviderRequest(materialProviderId = UUID.randomUUID())
    }
}
