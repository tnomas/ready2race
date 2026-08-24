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
import de.lambda9.ready2race.backend.calls.responses.AfterCommit
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

    /**
     * Meldet allen Zeitnahme-Boards der Veranstaltung, dass diese Startliste neu zu holen ist -
     * [TimingWsMessage.MatchesChanged], ein Auslöser ohne Rumpf.
     *
     * Liegt hier und nicht bei den Schreibern, weil die Nachricht genau EINE Sicht betrifft: die
     * dieses Service. Wer die Partienmenge ändert (Zeitplan, Rundenerzeugung, Freilos,
     * Typ-Zuordnung), ruft diese eine Zeile auf und muss weder den Broadcaster noch die
     * Commit-Regel kennen.
     *
     * Wie überall im Zeitnahme-Kanal erst NACH dem Commit: ein Board, das die Nachricht sofort
     * beantwortet, holte sonst über eine andere Verbindung den Stand VOR dem Schreiben - und ein
     * Rollback hätte eine Nachricht über eine Änderung erzeugt, die es nie gab. `AfterCommit`
     * puffert bis `respondKIO` committet hat und feuert für Nicht-HTTP-Aufrufer (Jobs, Tests)
     * unmittelbar.
     */
    fun broadcastMatchesChanged(eventId: UUID) {
        AfterCommit.register {
            TimingBroadcaster.broadcast(eventId, TimingWsMessage.MatchesChanged)
        }
    }

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
            //
            // Die MARKEN führen: started_at wird von der Zeitnahme in derselben Transaktion aus
            // ihnen gestempelt (TimingMatchStampService), die beiden Quellen können hier also
            // nicht widersprechen. Das Oder ist trotzdem nötig - für den Schiedsrichter-Stempel
            // ganz ohne Marken und für die gewollte Asymmetrie der Einzelkorrektur: Wird die
            // letzte Startmarke umgehängt oder einzeln zurückgenommen, bleibt started_at stehen
            // und die Partie gilt weiter als gestartet; zurück auf "offen" geht sie nur über die
            // Versuchs-Rücknahme.
            val anyTeamStarted = match.startedAt != null || teams.any { it.started }
            val allTeamsFinished = teams.isNotEmpty() && teams.all { it.finished }
            val hasActiveSequence = teams.any { it.competitionMatchTeam in teamsInActiveSequences }

            TimingMatchDto(
                competitionSetupMatch = match.setupMatchId,
                matchName = match.matchName,
                competition = match.competitionId,
                competitionName = match.competitionName,
                competitionIdentifier = match.competitionIdentifier,
                competitionShortName = match.competitionShortName,
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
