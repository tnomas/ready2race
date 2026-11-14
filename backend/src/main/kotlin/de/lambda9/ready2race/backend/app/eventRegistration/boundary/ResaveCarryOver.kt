package de.lambda9.ready2race.backend.app.eventRegistration.boundary

import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionRegistrationRecord
import java.util.UUID

/**
 * Was eine Meldung beim erneuten Speichern des Meldeformulars behält.
 *
 * Das Speichern löscht die nicht gesperrten Meldungen des Vereins und legt die vom Formular
 * genannten neu an - mit derselben ID, wenn das Formular sie mitschickt. Eine so bestehen
 * bleibende Meldung (gleiche ID, gleicher Wettkampf) übernimmt, was das Formular nicht trägt:
 * Meldungsnummer (ab der Fixierung fest, ADR-0111), angelegt am/von. Ihren Namen behält sie,
 * solange sich die Meldungen ihres Wettkampfs nicht ändern ([unchangedCompetitions]); kommt ein
 * Team dazu oder fällt eines weg, nummeriert der Speicherpfad wie bisher neu („#1", „#2", …).
 *
 * Nicht übernommen: Wertungskategorie (trägt das Formular), Verspätung (gelöscht werden nur
 * Meldungen derselben Art, sie ergibt sich deshalb gleich), geändert am/von (gibt das Speichern
 * wieder).
 */
class ResaveCarryOver private constructor(
    private val replaced: Map<UUID, CompetitionRegistrationRecord>,
    val unchangedCompetitions: Set<UUID>,
) {

    /** Die gelöschte Vorgängerin der Meldung [id] - nur, wenn sie im selben Wettkampf lag. */
    fun previous(id: UUID?, competitionId: UUID): CompetitionRegistrationRecord? =
        id?.let { replaced[it] }?.takeIf { it.competition == competitionId }

    companion object {
        val NONE = ResaveCarryOver(emptyMap(), emptySet())

        /**
         * @param before alle Meldungen des Vereins in der Veranstaltung vor dem Löschen
         * @param replacedIds die vom Speichern gelöschten (und ggf. neu angelegten) Meldungen
         * @param remaining die Meldungen des Vereins nach dem Löschen (gesperrte, andere Art)
         * @param formIds je Formular-Meldung (Wettkampf, ID); `null` = neu im Formular
         */
        fun of(
            before: List<CompetitionRegistrationRecord>,
            replacedIds: Set<UUID>,
            remaining: List<CompetitionRegistrationRecord>,
            formIds: List<Pair<UUID, UUID?>>,
        ): ResaveCarryOver {
            val beforeByCompetition = before.groupBy({ it.competition!! }, { it.id!! })
            val remainingByCompetition = remaining.groupBy({ it.competition!! }, { it.id!! })
            val formByCompetition = formIds.groupBy({ it.first }, { it.second })

            val unchanged = (beforeByCompetition.keys + formByCompetition.keys).filter { competition ->
                val form = formByCompetition[competition] ?: emptyList()
                val after: List<UUID?> = (remainingByCompetition[competition] ?: emptyList()) + form
                form.none { it == null } &&
                    after.toSet().size == after.size &&
                    after.toSet() == (beforeByCompetition[competition] ?: emptyList()).toSet()
            }.toSet()

            return ResaveCarryOver(
                replaced = before.filter { it.id in replacedIds }.associateBy { it.id!! },
                unchangedCompetitions = unchanged,
            )
        }
    }
}
