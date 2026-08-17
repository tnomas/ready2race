package de.lambda9.ready2race.backend.app.timing.entity

import java.util.UUID

data class TimingStationDto(
    val id: UUID,
    val event: UUID,
    val name: String,
    val type: TimingStationType,
    val sorting: Int,
)
