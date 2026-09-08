package de.lambda9.ready2race.backend.app.material.entity

import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult
import de.lambda9.ready2race.backend.validation.validate
import de.lambda9.ready2race.backend.validation.validators.StringValidators.maxLength
import de.lambda9.ready2race.backend.validation.validators.StringValidators.notBlank
import java.util.UUID

class MaterialItemRequest(
    val materialType: UUID,
    val number: Int?,
    val label: String,
    val note: String?,
    val status: MaterialItemStatus,
) : Validatable {
    override fun validate(): ValidationResult = ValidationResult.allOf(
        // Spiegelt den check-Constraint der Tabelle (char_length zwischen 1 und 20).
        this::label validate notBlank,
        this::label validate maxLength(20),
    )

    companion object {
        val example get() = MaterialItemRequest(
            materialType = UUID.randomUUID(),
            number = 7,
            label = "Boot 7",
            note = null,
            status = MaterialItemStatus.ACTIVE,
        )
    }
}
