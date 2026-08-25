package de.lambda9.ready2race.backend.app.timing.entity

import java.util.UUID

/**
 * Ein Posten, den dieser Wettkampf passiert, samt seiner Distanz auf DIESER Strecke.
 *
 * Name und Typ kommen vom Posten der Veranstaltung mit — die Liste steht sonst nur aus UUIDs da.
 * Die Reihenfolge ist die der Distanz, nicht die der Leitstand-Sortierung: Auf der Strecke ordnet
 * der Meter.
 */
data class CompetitionTimingStationDto(
    val timingStation: UUID,
    val name: String,
    val type: TimingStationType,
    val distanceMeters: Int,
)
