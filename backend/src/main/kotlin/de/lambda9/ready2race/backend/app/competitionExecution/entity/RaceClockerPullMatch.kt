package de.lambda9.ready2race.backend.app.competitionExecution.entity

import java.util.UUID

/**
 * Ein Lauf, wie ihn der Abruf von Hand aus der Datenbank bekommt: der Wellenname und der Pfad, über
 * den sich sein Rennen auflösen lässt — noch ohne das Rennen selbst.
 *
 * Das Gegenstück zum Kandidaten des Jobs
 * ([de.lambda9.ready2race.backend.app.raceclocker.entity.RaceClockerPollMatch]) und aus demselben
 * Grund pfadförmig: Seit dem Zeitnahmeprofil-Baum hängt das Rennen an einer von vier Ebenen, und
 * beide Wege müssen dieselbe Auflösung benutzen — sonst schriebe der Knopf die Ergebnisse eines
 * anderen Rennens als der Takt.
 */
data class RaceClockerPullMatch(
    val matchId: UUID,
    val competitionId: UUID,
    val roundId: UUID,
    /**
     * Die geplante Startzeit, der Wettkampf und der Laufname als RaceClocker-Wellenname (siehe
     * [WaveName]) — er MUSS genauso gebaut sein wie im Export
     * ([de.lambda9.ready2race.backend.app.competitionExecution.boundary.CompetitionExecutionService.buildCsv]),
     * sonst greift der Wellennamen-Abgleich in `assignFeedRows` nicht.
     */
    val waveName: String?,
)
