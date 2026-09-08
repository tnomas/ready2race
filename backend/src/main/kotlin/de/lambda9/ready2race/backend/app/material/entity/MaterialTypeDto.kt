package de.lambda9.ready2race.backend.app.material.entity

import java.util.UUID

data class MaterialTypeDto(
    val id: UUID,
    val name: String,
    val category: MaterialCategory,
    val description: String?,
)
