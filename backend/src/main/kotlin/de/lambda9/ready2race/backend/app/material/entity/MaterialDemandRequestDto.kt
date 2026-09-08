package de.lambda9.ready2race.backend.app.material.entity

import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult
import de.lambda9.ready2race.backend.validation.validate
import de.lambda9.ready2race.backend.validation.validators.IntValidators.min
import java.util.UUID

/** Bedarf einer Materialart am Wettkampf (oder an der Vorlage) - Gegenstück zu FeeForCompetitionRequestDto. */
data class MaterialDemandRequestDto(
    val materialType: UUID,
    val count: Int,
) : Validatable {
    override fun validate(): ValidationResult = ValidationResult.allOf(
        this::count validate min(1),
    )

    companion object {
        val example get() = MaterialDemandRequestDto(
            materialType = UUID.randomUUID(),
            count = 1,
        )
    }
}
