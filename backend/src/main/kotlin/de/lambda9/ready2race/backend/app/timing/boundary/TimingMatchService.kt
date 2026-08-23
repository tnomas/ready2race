package de.lambda9.ready2race.backend.app.timing.boundary

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.ServiceError
import de.lambda9.ready2race.backend.app.timing.control.TimingMatchRepo
import de.lambda9.ready2race.backend.app.timing.control.TimingModeAssignmentRepo
import de.lambda9.ready2race.backend.app.timing.control.TimingModeRepo
import de.lambda9.ready2race.backend.app.timing.control.TimingOfficialTimeRepo
import de.lambda9.ready2race.backend.app.timing.control.TimingSequenceEntryRepo
import de.lambda9.ready2race.backend.app.timing.control.toDto
import de.lambda9.ready2race.backend.app.timing.entity.TimingMatchDto
import de.lambda9.ready2race.backend.app.timing.entity.TimingMatchPhase
import de.lambda9.ready2race.backend.app.timing.entity.TimingMatchProgress
import de.lambda9.ready2race.backend.app.timing.entity.TimingMatchTeamDto
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationType
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.orDie
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import java.util.UUID

/**
 * Die Posten-Startliste: alle Partien der INTERN gezeiteten Wettkämpfe der Veranstaltung, in
 * Startreihenfolge, je Partie mit aufgelöstem Zeitnahmetyp, Teams und Zeitnahme-Zustand.
 *
 * Ein Endpunkt für beide Posten: der Startposten arbeitet die Liste von oben nach unten ab, der
 * Zielposten liest daraus, welches Rennen im Ziel erwartet wird und welche Boote noch fehlen
 * ([TimingMatchTeamDto.finished]). Alles Abgeleitete kommt aus reiner, einzeln getesteter Logik
 * (TimingStartOrderLogic, TimingModeResolveLogic, TimingMatchProgress) - dieser Service verdrahtet
 * sie nur mit den Zeilen aus der Datenbank.
 */
object TimingMatchService {

    fun getMatches(
        eventId: UUID,
    ): App<ServiceError, ApiResponse.ListDto<TimingMatchDto>> = KIO.comprehension {
        val matches = !TimingMatchRepo.getMatchesByEvent(eventId).orDie()
        val teamRows = !TimingMatchRepo.getMatchTeamsByEvent(eventId).orDie()
        val rounds = !TimingMatchRepo.getRoundsByEvent(eventId).orDie()
        val marks = !TimingOfficialTimeRepo.getAssignedActiveMarks(eventId).orDie()
        val teamsInActiveSequences = (!TimingSequenceEntryRepo.getTeamsInActiveSequences(eventId).orDie()).toSet()
        val modes = !TimingModeRepo.getByEvent(eventId).orDie()
        val assignments = !TimingModeAssignmentRepo.getByEvent(eventId).orDie()

        val modeById = modes.associateBy { it.id }
        val assignmentRows = assignments.map {
            TimingModeResolveLogic.ModeAssignment(it.competition, it.competitionSetupRound, it.timingMode)
        }

        val startedTeams = marks
            .filter { it.stationType == TimingStationType.START }
            .map { it.competitionMatchTeam }
            .toSet()
        val finishedTeams = marks
            .filter { it.stationType == TimingStationType.FINISH }
            .map { it.competitionMatchTeam }
            .toSet()

        // Die Teams der Freilos-Partien fallen hier automatisch weg: gruppiert wird über die
        // Partien der Match-Abfrage, und die schließt Freiläufe (ohne "muss gefahren werden")
        // bereits aus.
        val teamsByMatch = teamRows.groupBy { it.setupMatchId }
        val roundOrder = TimingStartOrderLogic.roundOrder(
            rounds.map { TimingStartOrderLogic.RoundRef(it.id, it.nextRound) }
        )

        val dtos = matches.map { match ->
            val teams = (teamsByMatch[match.setupMatchId] ?: emptyList())
                .sortedBy { it.startNumber }
                .map { team ->
                    TimingMatchTeamDto(
                        competitionMatchTeam = team.teamId,
                        startNumber = team.startNumber,
                        teamName = team.teamName,
                        clubName = team.clubName,
                        started = team.teamId in startedTeams,
                        finished = team.teamId in finishedTeams,
                    )
                }

            // "Gestartet" auf Partie-Ebene zählt auch den per Hand gestempelten Start des
            // Schiedsrichters (started_at) - nicht nur Marken; das Team-Flag bleibt markenbasiert.
            val anyTeamStarted = match.startedAt != null || teams.any { it.started }
            val allTeamsFinished = teams.isNotEmpty() && teams.all { it.finished }
            val hasActiveSequence = teams.any { it.competitionMatchTeam in teamsInActiveSequences }

            TimingMatchDto(
                competitionSetupMatch = match.setupMatchId,
                matchName = match.matchName,
                competition = match.competitionId,
                competitionName = match.competitionName,
                competitionIdentifier = match.competitionIdentifier,
                round = match.roundId,
                roundName = match.roundName,
                startTime = match.startTime,
                startedAt = match.startedAt,
                finishedAt = match.finishedAt,
                phase = TimingMatchPhase.of(match.activatedAt, match.finishedAt),
                progress = TimingMatchProgress.of(
                    finishedAt = match.finishedAt,
                    hasActiveSequence = hasActiveSequence,
                    anyTeamStarted = anyTeamStarted,
                    allTeamsFinished = allTeamsFinished,
                ),
                timingMode = TimingModeResolveLogic
                    .resolve(assignmentRows, match.competitionId, match.roundId)
                    ?.let { modeById[it]?.toDto() },
                teams = teams,
            )
        }

        val keyByMatch = matches.associate { match ->
            match.setupMatchId to TimingStartOrderLogic.MatchSortKey(
                startTime = match.startTime,
                competitionIdentifier = match.competitionIdentifier,
                roundIndex = roundOrder[match.roundId] ?: Int.MAX_VALUE,
                executionOrder = match.executionOrder,
                matchId = match.setupMatchId,
            )
        }

        KIO.ok(
            ApiResponse.ListDto(
                dtos.sortedWith(compareBy(TimingStartOrderLogic.comparator) { keyByMatch[it.competitionSetupMatch]!! })
            )
        )
    }
}
