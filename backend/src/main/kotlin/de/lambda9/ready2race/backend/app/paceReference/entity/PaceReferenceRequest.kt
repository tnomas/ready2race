package de.lambda9.ready2race.backend.app.paceReference.entity

import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult
import de.lambda9.ready2race.backend.validation.validate
import de.lambda9.ready2race.backend.validation.validators.IntValidators.min
import de.lambda9.ready2race.backend.validation.validators.StringValidators.notBlank

data class PaceReferenceRequest(
    val name: String,
    val mode: PaceReferenceMode,
    val referenceMeters: Int,
) : Validatable {
    override fun validate(): ValidationResult = ValidationResult.allOf(
        this::name validate notBlank,
        // Spiegelt den check-Constraint der Tabelle: eine Bezugsstrecke von 0 Metern ergäbe beim
        // Rechnen eine Division durch null, eine negative gar nichts.
        this::referenceMeters validate min(1),
    )

    companion object {

        val example get() = PaceReferenceRequest(
            name = "Rudern",
            mode = PaceReferenceMode.TIME_PER_DISTANCE,
            referenceMeters = 500,
        )
    }
}
