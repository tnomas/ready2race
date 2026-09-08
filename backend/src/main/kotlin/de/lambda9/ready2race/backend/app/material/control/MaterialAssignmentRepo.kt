package de.lambda9.ready2race.backend.app.material.control

import de.lambda9.ready2race.backend.database.delete
import de.lambda9.ready2race.backend.database.exists
import de.lambda9.ready2race.backend.database.generated.tables.records.MaterialAssignmentRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_MATCH_TEAM
import de.lambda9.ready2race.backend.database.generated.tables.references.MATERIAL_ASSIGNMENT
import de.lambda9.ready2race.backend.database.insert
import java.util.UUID

/**
 * Zuteilung von Materialstücken an Anfragen (Spec Abschnitt 9). [MaterialService.setAssignments]
 * ersetzt die Liste je Anfrage immer vollständig - Löschen und Neuanlegen in derselben
 * Transaktion, kein Delta.
 */
object MaterialAssignmentRepo {

    fun create(records: Collection<MaterialAssignmentRecord>) = MATERIAL_ASSIGNMENT.insert(records)

    fun deleteForRequest(requestId: UUID) = MATERIAL_ASSIGNMENT.delete { MATERIAL_REQUEST.eq(requestId) }

    /** Grundlage für [de.lambda9.ready2race.backend.app.material.entity.MaterialError.MatchNotOfRegistration]: startet die Meldung in diesem Lauf wirklich? */
    fun matchContainsRegistration(matchId: UUID, registrationId: UUID) = COMPETITION_MATCH_TEAM.exists {
        COMPETITION_MATCH.eq(matchId).and(COMPETITION_REGISTRATION.eq(registrationId))
    }
}
