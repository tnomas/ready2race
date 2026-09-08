package de.lambda9.ready2race.backend.app.material.entity

import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult
import de.lambda9.ready2race.backend.validation.validate
import de.lambda9.ready2race.backend.validation.validators.StringValidators.notBlank

class MaterialTypeRequest(
    val name: String,
    val category: MaterialCategory,
    val description: String?,
) : Validatable {
    override fun validate(): ValidationResult = ValidationResult.allOf(
        this::name validate notBlank,
    )

    companion object {
        val example get() = MaterialTypeRequest(
            name = "C4x+",
            category = MaterialCategory.BOAT,
            description = null,
        )
    }
}
