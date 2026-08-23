package de.lambda9.ready2race.backend.app.timing.boundary

import java.util.UUID

/**
 * Reine Logik der Frage "welcher Zeitnahmetyp gilt für diesen Wettkampf in dieser Runde?" -
 * bewusst ohne Datenbank- und Ktor-Bezug, nach dem Muster von `RequirementScopeLogic`.
 *
 * Die Zuordnungen (`timing_mode_assignment`) kennen zwei Ebenen: ein Eintrag ohne Runde gilt für
 * den ganzen Wettkampf, ein Eintrag mit Runde genau für diese Runde. Die Auflösung ist dieselbe
 * Richtung wie beim coalesce von `competition.timing_system` über `event.timing_system`: die
 * speziellere Ebene gewinnt.
 */
object TimingModeResolveLogic {

    /** Eine Zuordnungszeile, auf das für die Auflösung Nötige reduziert. */
    data class ModeAssignment(
        val competition: UUID,
        val round: UUID?,
        val mode: UUID,
    )

    /**
     * Der Typ für [competition] in [round]: der Runden-Eintrag schlägt den Wettkampf-Eintrag,
     * ohne jeden Eintrag gibt es keinen Typ (null).
     *
     * Ein Runden-Eintrag deckt ausschließlich seine Runde ab - er "vererbt" nichts an andere
     * Runden und nichts an die Wettkampf-Ebene ([round] == null fragt genau diese Ebene ab).
     * Die Eindeutigkeit je (Wettkampf, Runde) erzwingt die Datenbank (`unique nulls not
     * distinct`), deshalb genügt hier `firstOrNull`.
     */
    fun resolve(
        assignments: Collection<ModeAssignment>,
        competition: UUID,
        round: UUID?,
    ): UUID? =
        round?.let { r ->
            assignments.firstOrNull { it.competition == competition && it.round == r }?.mode
        } ?: assignments.firstOrNull { it.competition == competition && it.round == null }?.mode
}
