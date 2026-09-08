package de.lambda9.ready2race.backend.app.material.entity

import java.util.UUID

/** Eine Veranstaltung, zu der der eigene Anbieter eingeladen ist - Veranstaltungswahl des Anbieters. */
data class MaterialProviderEventDto(
    val event: UUID,
    val eventName: String,
    val requestsClosed: Boolean,
)
