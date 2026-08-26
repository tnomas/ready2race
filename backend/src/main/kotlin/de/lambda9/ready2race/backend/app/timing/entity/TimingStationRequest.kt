package de.lambda9.ready2race.backend.app.timing.entity

import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult
import de.lambda9.ready2race.backend.validation.validate
import de.lambda9.ready2race.backend.validation.validators.StringValidators.notBlank

data class TimingStationRequest(
    val name: String,
    val type: TimingStationType,
    val sorting: Int,
) : Validatable {
    override fun validate(): ValidationResult = ValidationResult.allOf(
        this::name validate notBlank,
    )

    companion object {
        val example get() = TimingStationRequest(
            name = "Finish",
            type = TimingStationType.FINISH,
            sorting = 0,
        )
    }
}
