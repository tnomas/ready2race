package de.lambda9.ready2race.backend.app.timing.entity

import java.util.UUID

data class TimingTeamDto(
    val competitionMatchTeam: UUID,
    val startNumber: Int?,
    val teamName: String?,
    val clubName: String?,
    val participantNames: List<String>,
    val competitionName: String?,
    val matchName: String?,
    /** See [TimingMatchPhase] - lets boards put the currently expected teams first. */
    val matchPhase: TimingMatchPhase,
)
