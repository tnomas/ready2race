package de.lambda9.ready2race.backend.app.participantRequirement.entity

import java.util.*

data class ParticipantRequirementForEventDto(
    val id: UUID,
    val name: String,
    val description: String?,
    val optional: Boolean,
    val active: Boolean,
    val checkInApp: Boolean,
    val publiclyVisible: Boolean,
    val requirements: List<NamedParticipantRequirementForEventDto>,
    /**
     * Die beiden Schalter aus V202608141900. Die App braucht sie, um beim Abhaken überhaupt nach
     * Tag bzw. Wettkampf zu fragen - eine Bedingung ohne Schalter bleibt ein einzelner Haken.
     */
    val perEventDay: Boolean = false,
    val perCompetition: Boolean = false,
    /**
     * Die Grenzen des Erledigungsfensters in Minuten vor dem Start. Sie gehen mit, damit die App
     * "zu früh / im Fenster / zu spät" gegen die Startzeit des gewählten Laufs selbst rechnen
     * kann - fortlaufend, ohne dafür neu laden zu müssen.
     */
    val checkEarliestMinutesBefore: Int? = null,
    val checkLatestMinutesBefore: Int? = null,
)