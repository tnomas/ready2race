package de.lambda9.ready2race.backend.app.competitionExecution.boundary

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.competitionExecution.control.CompetitionMatchRepo
import de.lambda9.ready2race.backend.app.liveDashboard.control.LiveDashboardRepo
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.orDie
import java.util.UUID

/**
 * Die Vorbedingungen, die jeder Weg erfüllen muss, der einen Lauf an den Start ruft oder als
 * „Läuft" markiert – Schiedsrichter-Dashboard, Durchführungsseite und Zeitplan-Reiter. Sie
 * stehen hier an einer Stelle, damit die Wege nicht wieder auseinanderlaufen: Das Dashboard
 * hatte beide Prüfungen, die Durchführung keine.
 *
 * Die Fehler gibt der Aufrufer vor, denn jede Domäne antwortet mit ihrem eigenen Fehlertyp.
 */
object CompetitionMatchGuards {

    /**
     * Der Lauf muss zur Veranstaltung des Pfads gehören. Ein Lauf einer anderen Veranstaltung ist
     * unter diesem Pfad unbekannt – sonst könnte jede Sitzung mit Recht an Veranstaltung B einen
     * Lauf von A anfassen, und der Änderungsmarker von B zählte für eine Änderung an A hoch. Ein
     * unbekannter Lauf fällt in denselben Fehler.
     */
    fun <E> requireMatchOfEvent(eventId: UUID, matchId: UUID, notFound: () -> E): App<E, Unit> =
        KIO.comprehension {
            val matchEvent = !LiveDashboardRepo.getMatchEventId(matchId).orDie()
            !KIO.failOn(matchEvent != eventId) { notFound() }
            KIO.unit
        }

    /**
     * Ein beendeter Lauf darf nicht wieder an den Start gerufen oder als „Läuft" markiert werden:
     * [de.lambda9.ready2race.backend.app.liveDashboard.boundary.LiveDashboardLogic.deriveMatchState]
     * prüft die Aktivierung vor `finished_at`, der Lauf stünde danach überall – auch im
     * öffentlichen Programm – wieder auf „In Vorbereitung" bzw. „Läuft". Wieder geöffnet wird ein
     * Lauf über „Beenden zurücknehmen" oder „Zurücksetzen" der Durchführungsseite.
     */
    fun <E> requireMatchNotFinished(matchId: UUID, finished: () -> E): App<E, Unit> =
        KIO.comprehension {
            val isFinished = !CompetitionMatchRepo.isFinished(matchId).orDie()
            !KIO.failOn(isFinished) { finished() }
            KIO.unit
        }
}
