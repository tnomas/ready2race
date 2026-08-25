package de.lambda9.ready2race.backend.app.raceclocker.boundary

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.raceclocker.control.RaceClockerRaceRepo
import de.lambda9.ready2race.backend.app.raceclocker.entity.RaceClockerRaceRef
import de.lambda9.ready2race.backend.app.timingProfile.boundary.TimingProfileResolveLogic
import de.lambda9.ready2race.backend.app.timingProfile.control.TimingProfileRepo
import de.lambda9.ready2race.backend.app.timingProfile.entity.TimingProfileKind
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.orDie
import java.util.UUID

/**
 * Welches RaceClocker-Rennen für einen Pfad gilt — einmal je Veranstaltung gelesen, beliebig oft
 * gefragt.
 *
 * Die REGEL steht in [TimingProfileResolveLogic.resolve]. Diese Klasse ist die VERDRAHTUNG darum
 * herum: Zuordnungen lesen, Rennen lesen, auflösen, [RaceClockerRaceRef] bauen. Sie steht genau
 * einmal, weil sie sonst dreimal stünde — im Takt des Jobs, beim Abruf von Hand und im
 * Startlisten-Sammelexport — und drei Kopien in dem Moment auseinanderlaufen, in dem jemand eine
 * davon ändert. Am Renntag hieße das: Der Knopf schreibt die Ergebnisse eines anderen Rennens als
 * die Automatik.
 *
 * Welche Ebenen ein Aufrufer mitgibt, bleibt seine Entscheidung und steht an seiner Aufrufstelle:
 * Der Sammelexport fragt bewusst nur `raceFor(competitionId, null, null)`, weil er je Wettkampf
 * gruppiert.
 */
class RaceClockerRaceResolution(
    private val assignments: List<TimingProfileResolveLogic.Assignment>,
    private val racesById: Map<UUID, RaceClockerRaceRef>,
) {

    /**
     * Das Rennen für diesen Pfad, oder null — dann gibt es für diesen Lauf nichts zu holen.
     *
     * Null steht für beide Fälle, die dasselbe bedeuten: keine Zuordnung auf irgendeiner Ebene, und
     * eine Zuordnung auf ein Rennen, das es nicht (mehr) gibt.
     */
    fun raceFor(competition: UUID?, round: UUID?, match: UUID?): RaceClockerRaceRef? =
        TimingProfileResolveLogic.resolve(assignments, competition, round, match)?.let { racesById[it] }

    companion object {

        /**
         * Liest den Zeitnahmeprofil-Baum und die Rennen dieser Veranstaltung — zwei kleine
         * Abfragen, danach ist jede Frage nach einem Rennen rein.
         */
        fun forEvent(eventId: UUID): App<Nothing, RaceClockerRaceResolution> = KIO.comprehension {
            // Der Zuschnitt auf die Profil-Art steckt in der Abfrage - siehe die Begründung an
            // TimingProfileRepo.getAssignments.
            val assignments = (!TimingProfileRepo.getAssignments(eventId, TimingProfileKind.RACE).orDie())
                .map { TimingProfileResolveLogic.Assignment(it.competition, it.round, it.match, it.profile) }
            val racesById = (!RaceClockerRaceRepo.getForEvent(eventId).orDie())
                .associate { it.id to RaceClockerRaceRef(it.id, it.name, it.resultsUrl) }

            KIO.ok(RaceClockerRaceResolution(assignments, racesById))
        }
    }
}
