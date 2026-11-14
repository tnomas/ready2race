package de.lambda9.ready2race.backend.app.competitionExecution

import de.lambda9.ready2race.backend.app.competitionExecution.entity.CompetitionChallengeResultRequest
import de.lambda9.ready2race.backend.validation.ValidationResult
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** Ein Challenge-Ergebnis ist eine Strecke oder Zeit - negativ ist es nie. */
class ChallengeResultRequestTest {

    @Test
    fun negativeResultsAreInvalid() {
        assertTrue(CompetitionChallengeResultRequest(result = -1).validate() is ValidationResult.Invalid)
        assertEquals(ValidationResult.Valid, CompetitionChallengeResultRequest(result = 0).validate())
        assertEquals(ValidationResult.Valid, CompetitionChallengeResultRequest(result = 958000).validate())
    }
}
