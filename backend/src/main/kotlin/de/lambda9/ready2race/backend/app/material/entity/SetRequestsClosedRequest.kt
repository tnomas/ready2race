package de.lambda9.ready2race.backend.app.material.entity

import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult

class SetRequestsClosedRequest(
    val requestsClosed: Boolean,
) : Validatable {
    override fun validate(): ValidationResult = ValidationResult.Valid

    companion object {
        val example get() = SetRequestsClosedRequest(requestsClosed = true)
    }
}
