package de.lambda9.ready2race.backend.app.competitionProperties.entity

import de.lambda9.ready2race.backend.app.competitionCategory.entity.CompetitionCategoryDto
import de.lambda9.ready2race.backend.app.paceReference.entity.PaceReferenceDto

data class CompetitionPropertiesDto(
    val identifier: String,
    val name: String,
    val shortName: String?,
    val checkInOutRequired: Boolean,
    val description: String?,
    val competitionCategory: CompetitionCategoryDto?,
    val namedParticipants: List<NamedParticipantForCompetitionDto>,
    val fees: List<FeeForCompetitionDto>,
    val lateRegistrationAllowed: Boolean,
    val challengeConfig: CompetitionChallengeConfigDto?,
    val ratingCategoryRequired: Boolean,
    /** Gesamtstrecke in Metern; nur für die Tempo-Anzeige gebraucht, Zwischenzeiten gibt es auch ohne. */
    val distanceMeters: Int?,
    /** Aufgelöst wie [competitionCategory], damit die Anzeige die Beschriftung nicht nachschlagen muss. */
    val paceReference: PaceReferenceDto?,
)