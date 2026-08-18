package de.lambda9.ready2race.backend.app.timing.control

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.timing.entity.*
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingStartSequenceEntryRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingStartSequenceRecord
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

fun sequenceDto(
    record: TimingStartSequenceRecord,
    entries: List<TimingStartSequenceEntryRecord>,
): TimingSequenceDto {
    val mode = SequenceMode.valueOf(record.mode)
    return TimingSequenceDto(
        id = record.id,
        event = record.event,
        station = record.station,
        mode = mode,
        intervalMillis = record.intervalMillis,
        leadInMillis = record.leadInMillis!!,
        state = SequenceState.valueOf(record.state!!),
        startedAtMillis = record.startedAtMillis,
        entries = entries.sortedBy { it.position }.map { entry ->
            TimingSequenceEntryDto(
                id = entry.id,
                competitionMatchTeam = entry.competitionMatchTeam,
                position = entry.position,
                status = SequenceEntryStatus.valueOf(entry.status!!),
                plannedStartMillis = plannedStartMillis(record, entry.position),
                timeMark = entry.timeMark,
            )
        },
    )
}

/**
 * When the entry at [position] is due, or `null` while the sequence has not been started.
 *
 * Every planned instant is offset by the sequence's lead-in - the countdown (and its beeps) run
 * during that window, so the first entry only fires once it has elapsed. MASS fires everything at
 * the same instant after the lead-in; INTERVAL gives every position its own slot on top of that,
 * which is why a SKIPPED entry does not shift the ones behind it - its slot simply passes empty.
 */
fun plannedStartMillis(record: TimingStartSequenceRecord, position: Int): Long? {
    val startedAt = record.startedAtMillis ?: return null
    val leadIn = record.leadInMillis ?: 0L
    return when (SequenceMode.valueOf(record.mode)) {
        SequenceMode.MASS -> startedAt + leadIn
        SequenceMode.INTERVAL -> startedAt + leadIn + position * (record.intervalMillis ?: 0L)
    }
}

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
