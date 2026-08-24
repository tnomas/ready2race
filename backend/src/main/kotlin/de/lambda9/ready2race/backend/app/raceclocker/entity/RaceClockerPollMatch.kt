package de.lambda9.ready2race.backend.app.raceclocker.entity

import java.time.LocalDateTime
import java.util.UUID

/**
 * Ein Lauf, so wie ihn die Abfrage des automatischen Abrufs liefert: noch OHNE Rennen.
 *
 * Das Rennen hängt seit dem Zeitnahmeprofil-Baum an einer von vier Ebenen (Veranstaltung,
 * Wettkampf, Runde, Partie) und wird deshalb nicht mehr mitgelesen, sondern im Takt aufgelöst
 * ([de.lambda9.ready2race.backend.app.raceclocker.boundary.RaceClockerPollLogic.candidatesFor]).
 * Erst mit aufgelöstem Rennen wird daraus ein [RaceClockerPollCandidate] - ein Kandidat ohne
 * Rennen existiert gar nicht erst.
 *
 * [matchId] ist wie überall `competition_match.competition_setup_match`; [roundId] und
 * [competitionId] tragen den Pfad, den die Auflösung braucht.
 */
data class RaceClockerPollMatch(
    val matchId: UUID,
    val competitionId: UUID,
    val roundId: UUID,
    val startTime: LocalDateTime?,
    val activatedAt: LocalDateTime?,
    val startedAt: LocalDateTime?,
    val autoPausedAt: LocalDateTime?,
    /**
     * Die geplante Startzeit, der Wettkampf und der Laufname als RaceClocker-Wellenname (siehe
     * [de.lambda9.ready2race.backend.app.competitionExecution.entity.WaveName]) - er hängt allein
     * am Lauf und wird deshalb hier gelesen, nicht aufgelöst.
     */
    val waveName: String?,
)
