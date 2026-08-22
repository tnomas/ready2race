package de.lambda9.ready2race.backend.app.eventDay.entity

import de.lambda9.ready2race.backend.validation.ValidationResult
import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.validate
import de.lambda9.ready2race.backend.validation.validators.StringValidators.notBlank
import java.time.LocalDate
import java.time.LocalDateTime

data class EventDayRequest(
    val date: LocalDate,
    val name: String?,
    val description: String?,
    /** Siehe [de.lambda9.ready2race.backend.app.eventDay.entity.EventDayDto.operationsStart]. */
    val operationsStart: LocalDateTime? = null,
): Validatable {
    override fun validate(): ValidationResult = ValidationResult.allOf(
        this::name validate notBlank,
        this::description validate notBlank
    )

    companion object {
        val example get() = EventDayRequest(
            date = LocalDate.now(),
            name = "Name",
            description = "Description",
            operationsStart = LocalDate.now().atTime(7, 0),
        )
    }
}