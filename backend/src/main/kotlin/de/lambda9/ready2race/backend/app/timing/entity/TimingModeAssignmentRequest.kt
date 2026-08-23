package de.lambda9.ready2race.backend.app.timing.entity

import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult
import java.util.UUID

/**
 * Upsert einer Typ-Zuordnung: für die (Wettkampf, Runde)-Kombination wird der Eintrag angelegt
 * oder ersetzt; [timingMode] null räumt ihn ab. Ein einziger PUT-Endpunkt statt POST/PUT/DELETE,
 * weil die Kombination der natürliche Schlüssel ist (`unique nulls not distinct`) und die
 * Oberfläche genau so denkt: "diese Runde bekommt diesen Typ / keinen eigenen Typ mehr".
 */
data class TimingModeAssignmentRequest(
    val competition: UUID,
    val competitionSetupRound: UUID?,
    val timingMode: UUID?,
) : Validatable {

    override fun validate(): ValidationResult = ValidationResult.Valid

    companion object {
        val example
            get() = TimingModeAssignmentRequest(
                competition = UUID.randomUUID(),
                competitionSetupRound = null,
                timingMode = UUID.randomUUID(),
            )
    }
}
