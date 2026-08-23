package de.lambda9.ready2race.backend.app.timing.control

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.timing.entity.*
import de.lambda9.ready2race.backend.data.Timecode
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingDeviceTokenRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingModeAssignmentRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingModeRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingOfficialTimeRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingStartSequenceEntryRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingStartSequenceRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingStationRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingTimeMarkRecord
import de.lambda9.ready2race.backend.parsing.Parser
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
        linkedStation = linkedStation,
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
            linkedStation = linkedStation,
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

/**
 * The effective official time of [record], or null when it has none.
 *
 * `override ?? computed`, plus the penalty. A [OfficialTimeResultStatus] other than
 * [OfficialTimeResultStatus.NONE] supersedes any time - a disqualified team has no time, however
 * many marks it produced.
 */
fun effectiveMillis(record: TimingOfficialTimeRecord): Long? {
    if (OfficialTimeResultStatus.valueOf(record.resultStatus!!) != OfficialTimeResultStatus.NONE) return null
    val base = record.overrideMillis ?: record.computedMillis ?: return null
    return base + (record.penaltyMillis ?: 0L)
}

fun officialTimeDto(
    record: TimingOfficialTimeRecord,
    startMillis: Long?,
    finishMillis: Long?,
): OfficialTimeDto = OfficialTimeDto(
    competitionMatchTeam = record.competitionMatchTeam,
    event = record.event,
    startMillis = startMillis,
    finishMillis = finishMillis,
    computedMillis = record.computedMillis,
    overrideMillis = record.overrideMillis,
    penaltyMillis = record.penaltyMillis ?: 0L,
    resultStatus = OfficialTimeResultStatus.valueOf(record.resultStatus!!),
    effectiveMillis = effectiveMillis(record),
    dirty = record.dirty ?: false,
    pushedAt = record.pushedAt,
)

/**
 * A team that has marks but no official-time row yet, rendered like one so the Leitstand table can
 * list every team it might compute a time for.
 */
fun unpersistedOfficialTimeDto(
    teamId: UUID,
    eventId: UUID,
    startMillis: Long?,
    finishMillis: Long?,
): OfficialTimeDto = OfficialTimeDto(
    competitionMatchTeam = teamId,
    event = eventId,
    startMillis = startMillis,
    finishMillis = finishMillis,
    computedMillis = null,
    overrideMillis = null,
    penaltyMillis = 0L,
    resultStatus = OfficialTimeResultStatus.NONE,
    effectiveMillis = null,
    dirty = false,
    pushedAt = null,
)

/**
 * The [Timecode] to persist for an official time of [effectiveMillis].
 *
 * Parity with the results import is the point here: the value is rendered and then read back through
 * the very same [Parser.timecode] that `CompetitionExecutionService.updateMatchResult(-ByFile)` runs
 * on a time cell, so the stored `base_unit` / `millisecond_precision` cannot drift from what an
 * imported time of the same length would have produced. The base unit follows the magnitude (as a
 * hand-typed or exported time would), the precision is always THREE because timing marks are
 * millisecond-exact.
 */
fun officialTimecode(effectiveMillis: Long): Timecode {
    val baseUnit = when {
        effectiveMillis >= 3_600_000 -> Timecode.BaseUnit.HOURS
        effectiveMillis >= 60_000 -> Timecode.BaseUnit.MINUTES
        else -> Timecode.BaseUnit.SECONDS
    }
    val rendered = Timecode(effectiveMillis, baseUnit, Timecode.MillisecondPrecision.THREE).toString()
    return Parser.timecode.parse(rendered)
}

fun TimingModeRecord.toDto(): TimingModeDto = TimingModeDto(
    id = id,
    event = event,
    name = name,
    withLaps = withLaps ?: false,
    startGrouping = TimingStartGrouping.valueOf(startGrouping),
    intervalSeconds = intervalSeconds,
    // Not-null-Spalte mit Default; jOOQ typisiert sie dennoch nullable (bekanntes Muster, siehe
    // EventTimingConfigDto) - der Datenbank-Default ist die einzig richtige Rückfalllinie.
    leadInSeconds = leadInSeconds ?: 10,
)

fun TimingModeRequest.toRecord(userId: UUID, eventId: UUID): TimingModeRecord =
    LocalDateTime.now().let { now ->
        TimingModeRecord(
            id = UUID.randomUUID(),
            event = eventId,
            name = name,
            withLaps = withLaps,
            startGrouping = startGrouping.name,
            intervalSeconds = intervalSeconds,
            leadInSeconds = leadInSeconds,
            createdAt = now,
            createdBy = userId,
            updatedAt = now,
            updatedBy = userId,
        )
    }

fun TimingModeAssignmentRecord.toDto(): TimingModeAssignmentDto = TimingModeAssignmentDto(
    id = id,
    competition = competition,
    competitionSetupRound = competitionSetupRound,
    timingMode = timingMode,
)

fun TimingDeviceTokenRecord.toDto(): TimingDeviceTokenDto = TimingDeviceTokenDto(
    id = id,
    event = event,
    station = station,
    name = name,
    revoked = revoked ?: false,
    // Die Spalte ist zugleich das Kennzeichen (siehe Migration V202608211420): Klartext
    // gespeichert <=> automatisch ausgestellt. Der Klartext selbst verlässt diese Konvertierung
    // nie - er taucht nur in der Share-Link-Antwort auf.
    autoIssued = shareLinkToken != null,
    createdAt = createdAt,
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
