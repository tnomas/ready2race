package de.lambda9.ready2race.backend.app.timing.entity

import java.util.UUID

data class TimeMarkDto(
    val id: UUID,
    val event: UUID,
    val station: UUID,
    val timestampMillis: Long,
    val source: String,
    val status: String,
    val createdBy: UUID?,
    val assignedTeam: UUID?,
)
