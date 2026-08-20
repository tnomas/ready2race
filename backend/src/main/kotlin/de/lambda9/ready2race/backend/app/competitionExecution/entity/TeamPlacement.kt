package de.lambda9.ready2race.backend.app.competitionExecution.entity

data class TeamPlacement(
    val team: CompetitionMatchTeamWithRegistration,
    val place: Int,
    // Match context is only set when the round's placesOption is PER_MATCH,
    // i.e. the place is scored separately within this match instead of across the whole round
    val matchName: String?,
    val matchWeighting: Int?,
)
