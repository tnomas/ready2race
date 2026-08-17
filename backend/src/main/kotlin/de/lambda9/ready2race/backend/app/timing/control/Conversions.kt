package de.lambda9.ready2race.backend.app.timing.control

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.timing.entity.*
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingStationRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingTimeMarkRecord
import de.lambda9.tailwind.core.KIO
import java.time.LocalDateTime
import java.util.UUID

fun TimingStationRecord.toDto(): App<Nothing, TimingStationDto> = KIO.ok(
    TimingStationDto(
        id = id,
        event = event,
        name = name,
        type = TimingStationType.valueOf(type),
        sorting = sorting,
    )
)

fun TimingStationRequest.toRecord(userId: UUID, eventId: UUID): App<Nothing, TimingStationRecord> = KIO.ok(
    LocalDateTime.now().let { now ->
        TimingStationRecord(
            id = UUID.randomUUID(),
            event = eventId,
            name = name,
            type = type.name,
            sorting = sorting,
            createdAt = now,
            createdBy = userId,
            updatedAt = now,
            updatedBy = userId,
        )
    }
)

fun timeMarkDto(record: TimingTimeMarkRecord, assignedTeam: UUID?): TimeMarkDto = TimeMarkDto(
    id = record.id,
    event = record.event,
    station = record.station,
    timestampMillis = record.timestampMillis,
    source = record.source!!,
    status = record.status!!,
    createdBy = record.createdBy,
    assignedTeam = assignedTeam,
)
