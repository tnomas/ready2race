package de.lambda9.ready2race.backend.app.competitionRegistration.entity

import de.lambda9.ready2race.backend.app.competitionDeregistration.entity.CompetitionDeregistrationDto
import de.lambda9.ready2race.backend.app.participantRequirement.entity.ParticipantRequirementDto
import de.lambda9.ready2race.backend.app.ratingcategory.entity.RatingCategoryDto
import java.time.LocalDateTime
import java.util.*

data class CompetitionRegistrationTeamDto(
    val id: UUID,
    /** Der automatische Zähler ("#1", "#2"), nicht der Name der Mannschaft - siehe [displayName]. */
    val name: String?,
    /**
     * Der von Hand vergebene Mannschaftsname, leer bei den allermeisten Meldungen. Er schlägt in
     * jeder Anzeige die Vereinskette.
     */
    val displayName: String?,
    val clubId: UUID,
    val clubName: String,
    val namedParticipants: List<CompetitionRegistrationTeamNamedParticipantDto>,
    val deregistration: CompetitionDeregistrationDto?,
    val globalParticipantRequirements: List<ParticipantRequirementDto>,
    val challengeResultValue: Int?,
    val challengeResultVerifiedAt: LocalDateTime?,
    val challengeResultDocuments: Map<UUID, String>?,
    val ratingCategory: RatingCategoryDto?,
)