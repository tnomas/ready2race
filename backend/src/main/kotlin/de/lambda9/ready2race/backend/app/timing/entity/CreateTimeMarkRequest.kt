package de.lambda9.ready2race.backend.app.timing.entity

import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult
import java.util.UUID

data class CreateTimeMarkRequest(
    val id: UUID,
    val station: UUID,
    val timestampMillis: Long,
) : Validatable {
    override fun validate(): ValidationResult = ValidationResult.Valid

    companion object {
        val example get() = CreateTimeMarkRequest(
            id = UUID.randomUUID(),
            station = UUID.randomUUID(),
            timestampMillis = 1755430000000,
        )
    }
}
