package de.lambda9.ready2race.backend.app.competitionExecution.entity

import java.util.UUID

data class CompetitionTeamPlaceDto(
    val competitionRegistrationId: UUID,
    val teamNumber: Int,
    val teamName: String?,
    val clubId: UUID,
    val clubName: String,
    val actualClubName: String?,
    val namedParticipants: List<CompetitionTeamNamedParticipantDto>,
    val place: Int,
    // Name of the match the place was scored in. Only set when the round scores places separately per match
    val matchName: String?,
    val deregistered: Boolean,
    val deregistrationReason: String?,
)