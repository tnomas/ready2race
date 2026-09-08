package de.lambda9.ready2race.backend.app.material.entity

import java.util.UUID

data class MaterialOfferDto(
    val id: UUID,
    val event: UUID,
    val materialProvider: UUID,
    val materialType: UUID,
    val materialTypeName: String,
    val category: MaterialCategory,
    val priceText: String?,
    val plannedCount: Int,
    val changeoverMinutes: Int,
)
