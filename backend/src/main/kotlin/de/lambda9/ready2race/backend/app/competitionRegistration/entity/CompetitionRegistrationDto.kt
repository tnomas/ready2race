package de.lambda9.ready2race.backend.app.competitionRegistration.entity

import de.lambda9.ready2race.backend.app.ratingcategory.entity.RatingCategoryDto
import de.lambda9.ready2race.backend.app.competitionDeregistration.entity.CompetitionDeregistrationDto
import java.time.LocalDateTime
import java.util.*

data class CompetitionRegistrationDto(
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
    val optionalFees: List<CompetitionRegistrationFeeDto>,
    val namedParticipants: List<CompetitionRegistrationNamedParticipantDto>,
    val isLate: Boolean,
    val ratingCategory: RatingCategoryDto?,
    val updatedAt: LocalDateTime,
    val createdAt: LocalDateTime,
    val deregistration: CompetitionDeregistrationDto?,
)