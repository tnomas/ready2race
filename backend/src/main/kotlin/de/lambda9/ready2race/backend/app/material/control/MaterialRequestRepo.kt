package de.lambda9.ready2race.backend.app.material.control

import de.lambda9.ready2race.backend.database.generated.tables.records.MaterialRequestRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.MATERIAL_REQUEST
import de.lambda9.ready2race.backend.database.insertReturning
import de.lambda9.ready2race.backend.database.select
import java.util.UUID

/**
 * Materialanfragen je Meldung und Angebot. Hier stehen erst die Funktionen, die Task 3.0 fürs
 * Überleben der Meldungs-ID beim erneuten Speichern der Anmeldung braucht - Entscheidung,
 * Zuteilung und die Anbieter-Sicht kommen mit Task 3.1 dazu.
 */
object MaterialRequestRepo {

    fun create(record: MaterialRequestRecord) = MATERIAL_REQUEST.insertReturning(record) { ID }

    fun forRegistration(competitionRegistrationId: UUID) =
        MATERIAL_REQUEST.select { COMPETITION_REGISTRATION.eq(competitionRegistrationId) }
}
