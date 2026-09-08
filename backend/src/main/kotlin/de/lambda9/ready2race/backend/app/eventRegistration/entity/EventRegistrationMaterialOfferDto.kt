package de.lambda9.ready2race.backend.app.eventRegistration.entity

import de.lambda9.ready2race.backend.app.material.entity.MaterialCapacityLevel
import java.util.UUID

/**
 * Ein Angebot zu einer Materialart im Anmelde-Template, mit der Ampel für die Auslastung.
 * `capacity` wird nicht in [de.lambda9.ready2race.backend.app.eventRegistration.control.EventRegistrationRepo]
 * berechnet (die bräuchte den Bedarf aller Vereine, nicht nur den dieser Abfrage), sondern von
 * [de.lambda9.ready2race.backend.app.eventRegistration.boundary.EventRegistrationService.getEventRegistrationTemplate]
 * aus [de.lambda9.ready2race.backend.app.material.boundary.MaterialService.capacityLevels] nachgetragen.
 */
data class EventRegistrationMaterialOfferDto(
    val offerId: UUID,
    val providerId: UUID,
    val providerName: String,
    val priceText: String?,
    val capacity: MaterialCapacityLevel,
    val requestsClosed: Boolean,
)
