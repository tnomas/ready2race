package de.lambda9.ready2race.backend.app.material.control

import de.lambda9.ready2race.backend.database.delete
import de.lambda9.ready2race.backend.database.exists
import de.lambda9.ready2race.backend.database.generated.tables.records.EffectiveMaterialForMatchTeamRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.MaterialAssignmentRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_MATCH_TEAM
import de.lambda9.ready2race.backend.database.generated.tables.references.EFFECTIVE_MATERIAL_FOR_MATCH_TEAM
import de.lambda9.ready2race.backend.database.generated.tables.references.MATERIAL_ASSIGNMENT
import de.lambda9.ready2race.backend.database.generated.tables.references.MATERIAL_OFFER
import de.lambda9.ready2race.backend.database.generated.tables.references.MATERIAL_REQUEST
import de.lambda9.ready2race.backend.database.insert
import de.lambda9.tailwind.jooq.JIO
import de.lambda9.tailwind.jooq.Jooq
import java.util.UUID

/**
 * Zuteilung von Materialstücken an Anfragen (Spec Abschnitt 9). [MaterialService.setAssignments]
 * ersetzt die Liste je Anfrage immer vollständig - Löschen und Neuanlegen in derselben
 * Transaktion, kein Delta.
 */
object MaterialAssignmentRepo {

    fun create(records: Collection<MaterialAssignmentRecord>) = MATERIAL_ASSIGNMENT.insert(records)

    fun deleteForRequest(requestId: UUID) = MATERIAL_ASSIGNMENT.delete { MATERIAL_REQUEST.eq(requestId) }

    /**
     * Die Veranstaltungen, in denen dieses Stück zugeteilt ist - eine Änderung an Nummer,
     * Bezeichnung oder Art erreicht genau deren Anzeigen (Änderungsmarker).
     */
    fun eventIdsForItem(itemId: UUID): JIO<List<UUID>> = Jooq.query {
        selectDistinct(MATERIAL_OFFER.EVENT)
            .from(MATERIAL_ASSIGNMENT)
            .join(MATERIAL_REQUEST).on(MATERIAL_REQUEST.ID.eq(MATERIAL_ASSIGNMENT.MATERIAL_REQUEST))
            .join(MATERIAL_OFFER).on(MATERIAL_OFFER.ID.eq(MATERIAL_REQUEST.MATERIAL_OFFER))
            .where(MATERIAL_ASSIGNMENT.MATERIAL_ITEM.eq(itemId))
            .fetch { it.value1()!! }
    }

    /** Grundlage für [de.lambda9.ready2race.backend.app.material.entity.MaterialError.MatchNotOfRegistration]: startet die Meldung in diesem Lauf wirklich? */
    fun matchContainsRegistration(matchId: UUID, registrationId: UUID) = COMPETITION_MATCH_TEAM.exists {
        COMPETITION_MATCH.eq(matchId).and(COMPETITION_REGISTRATION.eq(registrationId))
    }

    /**
     * Das wirksame Materialstück je Lauf-Team aus der Sicht `effective_material_for_match_team`
     * (dieselbe Quelle wie Boards, Schiedsrichter-Dashboard und Startliste) - für Oberflächen, die
     * ihre Teams nicht selbst per SQL laden (Durchführung). Teams ohne bestätigte Boots-Anfrage
     * fehlen im Ergebnis.
     */
    fun effectiveForMatchTeams(matchTeamIds: Collection<UUID>): JIO<List<EffectiveMaterialForMatchTeamRecord>> =
        Jooq.query {
            if (matchTeamIds.isEmpty()) {
                emptyList()
            } else {
                selectFrom(EFFECTIVE_MATERIAL_FOR_MATCH_TEAM)
                    .where(EFFECTIVE_MATERIAL_FOR_MATCH_TEAM.COMPETITION_MATCH_TEAM.`in`(matchTeamIds))
                    .fetch()
            }
        }
}
