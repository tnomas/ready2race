package de.lambda9.ready2race.backend.app.eventRegistration.entity

import de.lambda9.ready2race.backend.app.material.entity.MaterialRequestDto
import java.util.*

data class CompetitionRegistrationSingleUpsertDto(
    val competitionId: UUID,
    val optionalFees: List<UUID>?,
    val ratingCategory: UUID?,
    // Vom Formular zurückgegebene ID der Einzelmeldung. Materialanfragen der Materialvermietung
    // hängen an der Meldung - ohne stabile ID wären sie nach jedem Speichern weg (Task 3.0).
    val id: UUID? = null,
    // Nur zum Lesen im Template (Materialvermietung) - beim Upsert wird das Feld ignoriert, die
    // Anfragen laufen über den eigenen Endpunkt (`PUT .../materialRequests`).
    val materialRequests: List<MaterialRequestDto>? = null,
)