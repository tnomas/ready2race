package de.lambda9.ready2race.backend.app.timing.boundary

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.competitionExecution.control.CompetitionMatchRepo
import de.lambda9.ready2race.backend.app.competitionExecution.control.CompetitionMatchTeamRepo
import de.lambda9.ready2race.backend.app.timing.control.TimingTimeMarkRepo
import de.lambda9.ready2race.backend.database.SYSTEM_USER
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.orDie
import de.lambda9.tailwind.core.extensions.kio.traverse
import java.time.LocalDateTime
import java.util.UUID

/**
 * Schreibt die Laufzustands-Stempel (`activated_at`/`started_at`) der internen Zeitnahme - die
 * Entscheidungen dazu stehen in [TimingMatchStampLogic], hier stehen nur noch Lesen und Schreiben.
 *
 * Alle Funktionen laufen in der Transaktion der auslösenden Mutation (Request bzw.
 * Scheduler-Lauf): Stempel und Marke landen zusammen oder gar nicht, und die Anzeigen sehen nie
 * einen halben Zustand. Die Rückgabe "wurde geschrieben?" gehört zum Vertrag - der Aufrufer
 * entscheidet daran über den `EventChangeMarker`-Bump (HTTP-Wege sofort, der Sequenz-Scheduler
 * erst nach seinem Commit, siehe `TimingSequenceService.broadcastFireResult`).
 *
 * Ein beendeter Lauf (`finished_at` gesetzt) wird grundsätzlich nicht angefasst: Das Beenden hat
 * seine Aktivierung bereits abgeräumt, und ein neuer Stempel stellte ihn auf den Anzeigen wieder
 * als laufend dar. `finished_at` selbst schreibt oder löscht hier ebenfalls nichts - das Beenden
 * bleibt beim Schiedsrichter (siehe [TimingMatchStampLogic]).
 *
 * Die Aktivierungskette (`ScheduleChainService`) wird von diesen Stempeln bewusst NICHT
 * angestoßen - kein `resumeIfParked`, kein `decideAndActivate`: Die Kette rückt ausschließlich
 * auf das Beenden eines Laufs, das Setzen einer Runde und das Überspringen eines Slots vor. Ein
 * hier gestempelter Lauf wirkt auf sie rein über die Spalten, die sie ohnehin liest
 * (`ChainSlot.matchActivatedAt`/`matchStartedAt`) - exakt wie ein von Hand oder vom Abrufpfad
 * gestempelter.
 */
object TimingMatchStampService {

    /**
     * Ruft die Partien der [teamIds] an den Start (`activated_at`), sofern sie es noch nicht
     * sind - der Stempel für "Startsequenz eingerichtet/gestartet". Eine bestehende Aktivierung
     * (Schiedsrichter, Kette, Abrufpfad) wird nie vorgerückt.
     *
     * Gibt zurück, ob mindestens eine Partie gestempelt wurde.
     */
    fun activateMatchesOfTeams(
        teamIds: List<UUID>,
        userId: UUID?,
    ): App<Nothing, Boolean> = KIO.comprehension {
        val now = LocalDateTime.now()
        val matchIds = !matchIdsOf(teamIds)
        val wrote = !matchIds.traverse { matchId ->
            KIO.comprehension {
                var stamped = false
                !CompetitionMatchRepo.update(matchId) {
                    if (finishedAt == null && activatedAt == null) {
                        activatedAt = now
                        updatedBy = userId ?: SYSTEM_USER
                        updatedAt = now
                        stamped = true
                    }
                }.orDie()
                KIO.ok(stamped)
            }
        }
        KIO.ok(wrote.any { it })
    }

    /**
     * Stempelt den Ist-Start (`started_at`) der Partien der [teamIds] aus ihren zugeordneten,
     * aktiven Startmarken - der Stempel für "erste Startmarke der Partie". Aufgerufen nach jeder
     * Mutation, die einer Partie eine aktive Startmarke verschaffen kann (Sequenz feuert, Marke
     * zugeordnet, Marke reaktiviert); ohne solche Marke ist der Aufruf ein No-op.
     *
     * Der Stempel trägt den Zeitstempel der frühesten Marke, nicht die Uhrzeit des Requests
     * ([TimingMatchStampLogic.startStampFor] - dort auch, warum ein bestehender Ist-Start nie
     * verschoben wird). Wie beim Abrufpfad gilt: Ein entdeckter Start einer noch nicht gerufenen
     * Partie aktiviert sie im selben Zug - gestartet impliziert an den Start gerufen.
     *
     * Die Gegenrichtung gibt es hier bewusst nicht: Das Umhängen oder einzelne Zurücknehmen der
     * letzten Startmarke lässt `started_at` stehen (Einzelkorrekturen starten eine laufende
     * Partie nicht zurück) - zurück geht es allein über die Versuchs-Rücknahme
     * ([retractStartOfAttempt]).
     */
    fun stampStartFromMarks(
        eventId: UUID,
        teamIds: List<UUID>,
        userId: UUID?,
    ): App<Nothing, Boolean> = KIO.comprehension {
        val now = LocalDateTime.now()
        val matchIds = !matchIdsOf(teamIds)
        val wrote = !matchIds.traverse { matchId ->
            KIO.comprehension {
                val markMillis = !TimingTimeMarkRepo
                    .getStartMarkMillisForMatch(eventId, matchId, onlyActive = true).orDie()
                if (markMillis.isEmpty()) return@comprehension KIO.ok(false)

                var stamped = false
                !CompetitionMatchRepo.update(matchId) {
                    if (finishedAt == null) {
                        val stamp = TimingMatchStampLogic.startStampFor(startedAt, markMillis)
                        if (stamp != null) {
                            startedAt = stamp
                            if (activatedAt == null) {
                                activatedAt = now
                            }
                            updatedBy = userId ?: SYSTEM_USER
                            updatedAt = now
                            stamped = true
                        }
                    }
                }.orDie()
                KIO.ok(stamped)
            }
        }
        KIO.ok(wrote.any { it })
    }

    /**
     * Nimmt bei der Versuchs-Rücknahme den Ist-Start der Partie zurück - aber nur den eigenen:
     * ob der stehende Stempel von der Zeitnahme stammt, entscheidet
     * [TimingMatchStampLogic.startRetracted] am Wert selbst (Marken-Treffer über ALLE Startmarken
     * der Partie, auch bereits zurückgenommene). Ein Schiedsrichter-Stempel bleibt stehen.
     *
     * `activated_at` bleibt in jedem Fall unberührt: Die Partie ist weiterhin an den Start
     * gerufen und zeigt nach der Rücknahme wieder "In Vorbereitung".
     */
    fun retractStartOfAttempt(
        eventId: UUID,
        setupMatchId: UUID,
        userId: UUID,
    ): App<Nothing, Boolean> = KIO.comprehension {
        val markMillis = !TimingTimeMarkRepo
            .getStartMarkMillisForMatch(eventId, setupMatchId, onlyActive = false).orDie()
        if (markMillis.isEmpty()) return@comprehension KIO.ok(false)

        val now = LocalDateTime.now()
        var retracted = false
        !CompetitionMatchRepo.update(setupMatchId) {
            if (finishedAt == null && TimingMatchStampLogic.startRetracted(startedAt, markMillis)) {
                startedAt = null
                updatedBy = userId
                updatedAt = now
                retracted = true
            }
        }.orDie()
        KIO.ok(retracted)
    }

    /** Die Partien hinter den Teams, dedupliziert - Teams ohne Zeile fallen still heraus. */
    private fun matchIdsOf(teamIds: List<UUID>): App<Nothing, List<UUID>> =
        CompetitionMatchTeamRepo.getByIds(teamIds.distinct()).orDie()
            .map { teams -> teams.mapNotNull { it.competitionMatch }.distinct() }
}
