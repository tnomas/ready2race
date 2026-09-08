package de.lambda9.ready2race.backend.app.eventRegistration.entity

import de.lambda9.ready2race.backend.app.material.entity.MaterialCategory
import java.util.UUID

/**
 * Bedarf einer Materialart am Wettkampf im Anmelde-Template, mit den Angeboten der eingeladenen
 * Anbieter dazu - der Verein wählt daraus seine Anfragen ([MaterialRequestsUpsertRequest][de.lambda9.ready2race.backend.app.material.entity.MaterialRequestsUpsertRequest]).
 */
data class EventRegistrationMaterialDemandDto(
    val materialType: UUID,
    val name: String,
    val category: MaterialCategory,
    val count: Int,
    val offers: List<EventRegistrationMaterialOfferDto>,
)
