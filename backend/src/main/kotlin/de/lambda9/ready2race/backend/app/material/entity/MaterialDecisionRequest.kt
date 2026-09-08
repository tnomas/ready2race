package de.lambda9.ready2race.backend.app.material.entity

import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult
import de.lambda9.ready2race.backend.validation.validate
import de.lambda9.ready2race.backend.validation.validators.Validator

/**
 * Entscheidung des Anbieters über eine Anfrage. `REQUESTED` und `WITHDRAWN` sind hier keine
 * gültigen Ziele - `REQUESTED` ist der Ausgangszustand, `WITHDRAWN` setzt nur der Verein selbst
 * (Task 3.1).
 */
class MaterialDecisionRequest(
    val status: MaterialRequestStatus,
    val decisionNote: String?,
) : Validatable {

    override fun validate(): ValidationResult = ValidationResult.allOf(
        this::status validate allowedStatus,
    )

    companion object {
        // REQUESTED ist der Ausgangszustand, WITHDRAWN setzt nur der Verein selbst (Task 3.1) -
        // beides sind hier keine gültigen Entscheidungsziele.
        private val allowedStatus: Validator<MaterialRequestStatus?>
            get() = Validator { value ->
                if (value != null &&
                    value !in setOf(MaterialRequestStatus.CONFIRMED, MaterialRequestStatus.WAITLISTED, MaterialRequestStatus.DECLINED)
                ) {
                    ValidationResult.Invalid.Message { "must be CONFIRMED, WAITLISTED or DECLINED" }
                } else {
                    ValidationResult.Valid
                }
            }

        val example
            get() = MaterialDecisionRequest(status = MaterialRequestStatus.CONFIRMED, decisionNote = null)
    }
}
