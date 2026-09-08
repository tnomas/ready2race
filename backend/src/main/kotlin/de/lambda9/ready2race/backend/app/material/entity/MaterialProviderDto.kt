package de.lambda9.ready2race.backend.app.material.entity

import java.util.UUID

data class MaterialProviderDto(
    val id: UUID,
    val name: String,
    val contactName: String?,
    val contactEmail: String?,
    val contactPhone: String?,
    val note: String?,
)
