package de.lambda9.ready2race.backend.app.material.entity

import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult
import de.lambda9.ready2race.backend.validation.validate
import de.lambda9.ready2race.backend.validation.validators.IntValidators.notNegative
import java.util.UUID

class MaterialOfferRequest(
    val materialType: UUID,
    val priceText: String?,
    val plannedCount: Int,
    val changeoverMinutes: Int,
) : Validatable {
    override fun validate(): ValidationResult = ValidationResult.allOf(
        this::plannedCount validate notNegative,
        this::changeoverMinutes validate notNegative,
    )

    companion object {
        val example get() = MaterialOfferRequest(
            materialType = UUID.randomUUID(),
            priceText = "45 €",
            plannedCount = 5,
            changeoverMinutes = 30,
        )
    }
}
