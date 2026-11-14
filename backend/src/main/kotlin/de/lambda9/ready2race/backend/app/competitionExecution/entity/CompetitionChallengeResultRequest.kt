package de.lambda9.ready2race.backend.app.competitionExecution.entity

import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult
import de.lambda9.ready2race.backend.validation.validate
import de.lambda9.ready2race.backend.validation.validators.IntValidators


data class CompetitionChallengeResultRequest(
    val result: Int,
) : Validatable {
    override fun validate(): ValidationResult = this::result validate IntValidators.notNegative

    companion object {
        val example
            get() = CompetitionChallengeResultRequest(
                result = 958000
            )
    }
}