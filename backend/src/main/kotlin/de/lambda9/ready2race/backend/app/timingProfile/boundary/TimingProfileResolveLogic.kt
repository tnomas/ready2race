package de.lambda9.ready2race.backend.app.timingProfile.boundary

import java.util.UUID

/**
 * Reine Logik der Frage "welches Zeitnahmeprofil gilt für diese Partie?" — bewusst ohne
 * Datenbank- und Ktor-Bezug, nach dem Muster von `RequirementScopeLogic`.
 *
 * Die Zuordnungen (`timing_profile_assignment`) kennen vier Ebenen: Veranstaltung, Wettkampf,
 * Runde, Partie. Jede Zeile trägt ihren vollen Pfad, die speziellere Ebene gewinnt — dieselbe
 * Richtung, die früher das `coalesce(competition.timing_system, event.timing_system)` beschrieb,
 * nur einmal statt an drei Stellen formuliert.
 *
 * Ersetzt `TimingModeResolveLogic`, das dasselbe für zwei Ebenen und nur für Zeitnahmetypen tat.
 */
object TimingProfileResolveLogic {

    /** Eine Zuordnungszeile, auf das für die Auflösung Nötige reduziert. */
    data class Assignment(
        val competition: UUID?,
        val round: UUID?,
        val match: UUID?,
        val profile: UUID,
    )

    /**
     * Das Profil für [competition] / [round] / [match].
     *
     * Wer eine höhere Ebene abfragt, lässt die tieferen Argumente null: `resolve(a, null, null,
     * null)` beantwortet "was steht an der Wurzel", `resolve(a, c, null, null)` "was gilt für
     * diesen Wettkampf, wenn seine Runden erben". Genau das braucht die Oberfläche für die
     * Beschriftung "Erbt (…)".
     *
     * Die Eindeutigkeit je Ebene erzwingt die Datenbank (`unique nulls not distinct`), deshalb
     * genügt `firstOrNull`.
     */
    fun resolve(
        assignments: Collection<Assignment>,
        competition: UUID?,
        round: UUID?,
        match: UUID?,
    ): UUID? {
        if (match != null) {
            assignments.firstOrNull { it.match == match }?.let { return it.profile }
        }
        if (round != null) {
            assignments.firstOrNull { it.round == round && it.match == null }?.let { return it.profile }
        }
        if (competition != null) {
            assignments.firstOrNull { it.competition == competition && it.round == null && it.match == null }
                ?.let { return it.profile }
        }
        return assignments.firstOrNull { it.competition == null }?.profile
    }
}
