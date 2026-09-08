package de.lambda9.ready2race.backend.app.material.entity

import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult
import de.lambda9.ready2race.backend.validation.validate
import de.lambda9.ready2race.backend.validation.validators.StringValidators.notBlank

class MaterialProviderRequest(
    val name: String,
    val contactName: String?,
    val contactEmail: String?,
    val contactPhone: String?,
    val note: String?,
) : Validatable {
    override fun validate(): ValidationResult = ValidationResult.allOf(
        this::name validate notBlank,
    )

    companion object {
        val example get() = MaterialProviderRequest(
            name = "Bootshaus Nord",
            contactName = "Erika Muster",
            contactEmail = "info@bootshaus-nord.de",
            contactPhone = "0431 1234567",
            note = null,
        )
    }
}
