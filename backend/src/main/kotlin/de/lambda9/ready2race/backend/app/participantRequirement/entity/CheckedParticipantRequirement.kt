package de.lambda9.ready2race.backend.app.participantRequirement.entity

import java.util.UUID

/**
 * Eine abgehakte Bedingung einer Person.
 *
 * [eventDay] und [competition] sagen, **wofür** abgehakt wurde (null = ohne diese Einschränkung).
 * Ohne sie könnte die App am Steg nicht unterscheiden, ob der Haken für den heutigen oder den
 * gestrigen Lauf gesetzt wurde - und zeigte eine Wiegung von gestern als erledigt an.
 *
 * Beide Felder haben einen Vorgabewert, weil dieselbe Klasse auch den Rumpf von
 * [ParticipantRequirementCheckForEventUpsertDto] bildet; dort schickt die Meldestelle weiterhin
 * nur Kennung und Notiz.
 */
data class CheckedParticipantRequirement(
    val id: UUID,
    val note: String?,
    val eventDay: UUID? = null,
    val competition: UUID? = null,
)
