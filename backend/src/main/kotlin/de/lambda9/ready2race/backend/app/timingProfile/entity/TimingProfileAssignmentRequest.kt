package de.lambda9.ready2race.backend.app.timingProfile.entity

import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult
import java.util.UUID

/**
 * Upsert einer Ebene des Zeitnahmeprofil-Baums: für den angegebenen Pfad wird die Zeile angelegt
 * oder ersetzt; [profile] null räumt sie ab und stellt die Ebene damit auf "erben".
 *
 * Ein einziger PUT statt POST/PUT/DELETE, weil der Pfad der natürliche Schlüssel ist
 * (`unique nulls not distinct`) und die Oberfläche genau so denkt: "diese Partie bekommt dieses
 * Profil / erbt wieder". Alle drei Pfad-Felder null zielen auf die Wurzel (die Veranstaltung).
 *
 * Der Pfad wird hier NICHT geprüft: ob die Runde zum Wettkampf und die Partie zur Runde gehört,
 * kann nur der Service beantworten — er kennt die Veranstaltung, dieses Objekt nicht.
 */
data class TimingProfileAssignmentRequest(
    val competition: UUID?,
    val competitionSetupRound: UUID?,
    val competitionSetupMatch: UUID?,
    val profile: UUID?,
) : Validatable {

    override fun validate(): ValidationResult = ValidationResult.Valid

    companion object {
        val example
            get() = TimingProfileAssignmentRequest(
                competition = UUID.randomUUID(),
                competitionSetupRound = null,
                competitionSetupMatch = null,
                profile = UUID.randomUUID(),
            )
    }
}
