package de.lambda9.ready2race.backend.app.liveDashboard.entity

import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult
import java.util.UUID

/** Ein Wettkampf, wie ihn die Verwaltung braucht - Kennung, Name und ob er eine An-/Abmeldung verlangt. */
data class CheckSeverityCompetitionDto(
    val competitionId: UUID,
    val identifier: String,
    val name: String,
    val checkInOutRequired: Boolean,
)

/**
 * Eine Zeile der Verwaltungs-Matrix. [requirementId] ist nur bei den Bedingungs-Prüfungen gesetzt,
 * [name] trägt bei ihnen den Namen der Bedingung - die beiden festen Prüfungen benennt die
 * Oberfläche selbst.
 */
data class CheckSeverityRowDto(
    val checkType: CheckType,
    val requirementId: UUID?,
    val name: String?,
)

data class CheckSeverityEntryDto(
    val competitionId: UUID,
    val checkType: CheckType,
    val requirementId: UUID?,
    val severity: CheckSeverity,
)

/**
 * [entries] enthält NUR Abweichungen vom Standard. Die Oberfläche zeigt für jede Kombination aus
 * [competitions] und [rows] den passenden Eintrag oder den Standard aus [defaults].
 */
data class CheckSeverityConfigDto(
    val competitions: List<CheckSeverityCompetitionDto>,
    val rows: List<CheckSeverityRowDto>,
    val defaults: List<CheckSeverityRowDefaultDto>,
    val entries: List<CheckSeverityEntryDto>,
)

data class CheckSeverityRowDefaultDto(
    val checkType: CheckType,
    val requirementId: UUID?,
    val severity: CheckSeverity,
)

data class UpdateCheckSeverityRequest(
    val entries: List<CheckSeverityEntryDto>,
) : Validatable {
    // Die Zeilen bestehen ausschliesslich aus typisierten Feldern (UUID/Enum), die die
    // Deserialisierung bereits erzwingt - es gibt hier nichts zusaetzlich zu pruefen. Siehe
    // ParticipantRequirementCheckForEventConfigDto fuer denselben Fall.
    override fun validate(): ValidationResult = ValidationResult.Valid

    companion object {
        val example
            get() = UpdateCheckSeverityRequest(
                entries = listOf(
                    CheckSeverityEntryDto(
                        competitionId = UUID.randomUUID(),
                        checkType = CheckType.INVOICE_OPEN,
                        requirementId = null,
                        severity = CheckSeverity.CRITICAL,
                    )
                ),
            )
    }
}
