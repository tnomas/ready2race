package de.lambda9.ready2race.backend.app.material.entity

import java.util.UUID

/**
 * Ein zur Veranstaltung eingeladener Anbieter, aus Sicht des Veranstalters. openRequests/openDamages
 * werden erst mit den Anfragen (4.1) und Schäden (5.1) gefüllt - die Sub-Selects stehen schon
 * jetzt gegen die leeren Tabellen und liefern 0.
 */
data class EventMaterialProviderDto(
    val materialProvider: UUID,
    val name: String,
    val requestsClosed: Boolean,
    val openRequests: Int,
    val openDamages: Int,
)
