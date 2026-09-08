package de.lambda9.ready2race.backend.app.material.entity

import java.util.UUID

data class MaterialItemDto(
    val id: UUID,
    val materialProvider: UUID,
    val materialProviderName: String,
    val materialType: UUID,
    val materialTypeName: String,
    val category: MaterialCategory,
    val number: Int?,
    val label: String,
    val note: String?,
    val status: MaterialItemStatus,
    val openDamages: Int,
)
