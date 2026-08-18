package de.lambda9.ready2race.backend.app.timing.entity

import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult
import de.lambda9.ready2race.backend.validation.validate
import de.lambda9.ready2race.backend.validation.validators.StringValidators.notBlank
import java.util.UUID

data class TimingDeviceTokenRequest(
    val name: String,
    val station: UUID,
) : Validatable {

    override fun validate(): ValidationResult = ValidationResult.allOf(
        this::name validate notBlank,
    )

    companion object {
        val example
            get() = TimingDeviceTokenRequest(
                name = "Finish light barrier",
                station = UUID.randomUUID(),
            )
    }
}
