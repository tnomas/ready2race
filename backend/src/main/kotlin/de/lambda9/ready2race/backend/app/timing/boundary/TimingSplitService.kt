package de.lambda9.ready2race.backend.app.timing.boundary

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.competitionExecution.control.CompetitionMatchTeamLapRepo
import de.lambda9.ready2race.backend.app.timing.control.CompetitionTimingStationRepo
import de.lambda9.ready2race.backend.app.timing.control.SplitMarkRow
import de.lambda9.ready2race.backend.app.timing.control.TimingSplitRepo
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationType
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionMatchTeamLapRecord
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.orDie
import de.lambda9.tailwind.core.extensions.kio.traverse
import java.time.LocalDateTime
import java.util.UUID

/**
 * Die Übernahme der Streckenmarken in die Zwischenzeiten eines Laufs.
 *
 * Bis hierher versickerte, was ein SPLIT-Posten erfasste: Die Marke landete in
 * `timing_time_mark`, wurde einem Boot zugeordnet — und hatte keinen Abnehmer. Die offizielle
 * Zeit lässt sie ausdrücklich aus (sie ist eine Zwischenzeit, keine Zielzeit), und alle Anzeigen,
 * die Zwischenzeiten kennen (Board, Rundenband im Livestream, Ergebnisse), lesen sie aus
 * `competition_match_team_lap` — bis heute befüllt allein vom RaceClocker-Abruf.
 *
 * Dieser Dienst ist der fehlende Abnehmer, und zwar als ÜBERNAHME, nicht als zweite Quelle: Aus
 * den Marken werden Zeilen derselben Tabelle. Damit funktioniert jede vorhandene Anzeige
 * unverändert weiter. Das Muster ist dasselbe, mit dem [TimingOfficialTimeService] die Start- und
 * Zielmarken in offizielle Zeiten überführt.
 *
 * **Zwei Schreiber, eine Tabelle.** Getrennt sind sie über das Zeitnahme-System der
 * Veranstaltung: Der Abruf fasst nur RACECLOCKER-Veranstaltungen an, dieser Dienst nur INTERN.
 * Der Zuschnitt sitzt nicht hier, sondern in beiden Leseabfragen ([TimingSplitRepo]) — geschrieben
 * wird ausschließlich an Boote, die von dort kamen, also kann eine RaceClocker-Zeile gar nicht
 * erreicht werden.
 *
 * **Upsert statt Löschen-und-Einfügen.** `created_at` ist der Zeitpunkt, zu dem eine Zwischenzeit
 * ZUERST da war; das Rundenband im Livestream hängt seine Reihenfolge daran. Dieselbe Begründung
 * und dasselbe Paar (`upsert` + `deleteBeyond`) wie in
 * `CompetitionExecutionService.applyLapsFromFeed`.
 */
object TimingSplitService {

    /**
     * Rechnet die Zwischenzeiten der ganzen Veranstaltung neu und schreibt sie zurück.
     *
     * Der Zuschnitt ist die Veranstaltung und nicht das einzelne Boot, weil die Marken ohnehin in
     * einem Zug gelesen werden (wie [TimingOfficialTimeService.recomputeApplyEvent]) — und weil
     * eine geänderte Startmarke alle Zwischenzeiten ihres Bootes verschiebt, nicht nur die zuletzt
     * berührte.
     *
     * Gibt zurück, ob wirklich geschrieben wurde. Der Aufrufer entscheidet daran über den
     * [de.lambda9.ready2race.backend.app.eventInfo.boundary.EventChangeMarker]-Bump für die
     * öffentlichen Anzeigen — beim Aufrufer statt hier, damit eine Mutation, die zusätzlich eine
     * offizielle Zeit oder einen Laufzustands-Stempel ändert, alles zu genau EINEM Bump
     * zusammenlegt (und damit der Bump dort ausbleiben kann, wo kein AfterCommit-Puffer steht;
     * siehe TimingSequenceService).
     */
    fun recomputeEvent(
        eventId: UUID,
        userId: UUID?,
    ): App<Nothing, Boolean> = KIO.comprehension {
        val marks = !TimingSplitRepo.getAssignedActiveMarks(eventId).orDie()
        // Boote mit bereits geschriebenen Zeilen kommen dazu, weil eine gelöste Zuordnung ihr Boot
        // aus den Marken verschwinden lässt - ohne die zweite Spur bliebe die Zeile stehen.
        val teamsWithLaps = !TimingSplitRepo.getTeamsWithLaps(eventId).orDie()
        if (marks.isEmpty() && teamsWithLaps.isEmpty()) return@comprehension KIO.ok(false)

        val stationsByCompetition = !CompetitionTimingStationRepo.getByEvent(eventId).orDie()

        val splitsByTeam = marks.groupBy { it.competition }
            .flatMap { (competitionId, competitionMarks) ->
                // Ein Wettkampf ohne eingetragene Posten hat keine Strecke - dann gibt es nichts
                // zu ordnen und damit auch keine Zwischenzeit.
                val stations = stationsByCompetition[competitionId] ?: return@flatMap emptyList()
                TimingSplitLogic.compute(
                    competitionMarks.map { it.toMark() },
                    stations.map {
                        TimingSplitLogic.StationAtDistance(
                            station = it.timingStation,
                            name = it.name,
                            distanceMeters = it.distanceMeters,
                        )
                    },
                )
            }
            .groupBy { it.team }

        // Sortiert, und zwar aus einem einzigen Grund: Zwei gleichzeitige Zuordnungen schreiben
        // an dieselben Boote. Ohne feste Reihenfolge (keine der beiden Leseabfragen hat ein
        // `order by`) sperrten sie deren Lap-Zeilen in verschiedener Reihenfolge - die klassische
        // Aufstellung für einen Deadlock.
        val teams = (splitsByTeam.keys + teamsWithLaps).sorted()
        val existing = !CompetitionMatchTeamLapRepo.getByTeams(teams).orDie()
        val existingByTeam = existing.groupBy { it.competitionMatchTeam }
        val now = LocalDateTime.now()

        val changed = !teams.traverse { teamId ->
            writeTeam(
                teamId = teamId,
                splits = splitsByTeam[teamId].orEmpty(),
                existing = existingByTeam[teamId].orEmpty(),
                userId = userId,
                now = now,
            )
        }

        KIO.ok(changed.any { it })
    }

    /**
     * Schreibt die Zwischenzeiten EINES Bootes auf den Stand von [splits].
     *
     * Geschrieben wird nur, was sich wirklich unterscheidet: Der Neuberechnung liegt die ganze
     * Veranstaltung zugrunde, sie läuft an jeder einzelnen Marke, und ein Upsert über alle Boote
     * bei jedem Tastendruck wäre eine Schreiblast ohne Gegenwert. Zudem bliebe `updated`-freie
     * Ruhe die Voraussetzung dafür, dass eine unveränderte Zeile ihren Erstzeitpunkt behält.
     */
    private fun writeTeam(
        teamId: UUID,
        splits: List<TimingSplitLogic.Split>,
        existing: List<CompetitionMatchTeamLapRecord>,
        userId: UUID?,
        now: LocalDateTime,
    ): App<Nothing, Boolean> = KIO.comprehension {
        val existingByPosition = existing.associateBy { it.position }

        val toWrite = splits.filter { split ->
            val row = existingByPosition[split.position]
            row == null || row.name != split.name || row.lapMillis != split.lapMillis ||
                row.distanceMeters != split.distanceMeters
        }
        if (toWrite.isNotEmpty()) {
            !CompetitionMatchTeamLapRepo.upsert(
                toWrite.map { split ->
                    CompetitionMatchTeamLapRecord(
                        id = UUID.randomUUID(),
                        competitionMatchTeam = teamId,
                        position = split.position,
                        name = split.name,
                        lapMillis = split.lapMillis,
                        // Die Distanz wandert mit in die Zeile, statt später über den Posten
                        // nachgeschlagen zu werden: Eine Postenzuordnung kann sich ändern,
                        // nachdem die Zeit gelaufen ist - eine gespeicherte Zeit soll dann nicht
                        // rückwirkend eine andere Distanz bekommen.
                        distanceMeters = split.distanceMeters,
                        // Nur für die erstmalig angelegte Zeile wirksam - der Upsert lässt
                        // `created_at` einer bestehenden Zeile bewusst stehen.
                        createdAt = now,
                        createdBy = userId,
                    )
                }
            ).orDie()
        }

        // Was die Marken nicht mehr hergeben, verschwindet - eine zurückgenommene oder umgehängte
        // Marke ließe ihre Zwischenzeit sonst am Boot stehen.
        val keepPositions = splits.map { it.position }
        val obsolete = existing.any { it.position !in keepPositions }
        if (obsolete) {
            !CompetitionMatchTeamLapRepo.deleteBeyond(teamId, keepPositions).orDie()
        }

        KIO.ok(toWrite.isNotEmpty() || obsolete)
    }

    private fun SplitMarkRow.toMark() = TimingSplitLogic.Mark(
        team = competitionMatchTeam,
        station = station,
        timestampMillis = timestampMillis,
        isStart = stationType == TimingStationType.START,
    )
}
