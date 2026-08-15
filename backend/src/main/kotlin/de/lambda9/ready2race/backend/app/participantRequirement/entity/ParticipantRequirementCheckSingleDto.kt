package de.lambda9.ready2race.backend.app.participantRequirement.entity

import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult
import java.util.*

/**
 * Eine einzelne Prüfung, wie sie am Steg in der App abgehakt wird - eine Person, eine Bedingung,
 * ein Lauf.
 *
 * Warum das nicht über [ParticipantRequirementCheckForEventUpsertDto] läuft: Jener Weg beschreibt
 * die **vollständige** Liste der Erfüllten einer Bedingung (die Meldestelle schiebt Namen in einer
 * Auswahlliste hin und her) und löscht deshalb alles, was nicht mitgeschickt wurde. Für einen
 * einzelnen Scan am Steg ist das die falsche Aussage: dort ist nur über *diese eine* Person etwas
 * bekannt.
 *
 * [eventDay] und [competition] sagen, für welchen Lauf geprüft wurde. Was davon tatsächlich
 * gespeichert wird, entscheidet nicht der Aufrufer, sondern die Bedingung selbst - der Dienst legt
 * beides durch `RequirementScopeLogic.keyFor`. So kann eine App-Fassung, die die Schalter noch
 * nicht kennt, keine Dimensionen an eine Bedingung heften, die gar keine hat.
 */
data class ParticipantRequirementCheckSingleDto(
    val requirementId: UUID,
    val participantId: UUID,
    /** true hakt ab, false nimmt genau diese Prüfung wieder zurück. */
    val checked: Boolean,
    val note: String? = null,
    val eventDay: UUID? = null,
    val competition: UUID? = null,
) : Validatable {
    override fun validate(): ValidationResult = ValidationResult.Valid

    companion object {
        val example
            get() = ParticipantRequirementCheckSingleDto(
                requirementId = UUID.randomUUID(),
                participantId = UUID.randomUUID(),
                checked = true,
                note = "unter Vorbehalt",
                eventDay = UUID.randomUUID(),
                competition = UUID.randomUUID(),
            )
    }
}
