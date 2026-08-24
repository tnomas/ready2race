package de.lambda9.ready2race.backend.app.timing.control

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.timing.boundary.TimingPrecisionLogic
import de.lambda9.ready2race.backend.app.timing.entity.*
import de.lambda9.ready2race.backend.app.timingConfig.entity.TimingPrecision
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
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.fasterxml.jackson.module.kotlin.registerKotlinModule
import org.jooq.JSONB
import java.time.LocalDateTime
import java.util.UUID

/**
 * Eigener Mapper mit Kotlin-Modul für die Ton-JSONB-Spalten ([ToneStep], [CaptureTone]) -
 * dasselbe Muster wie beim Board-Config-Mapper (eventInfo/control/Conversions.kt): der nackte
 * ObjectMapper kann Kotlin-Datenklassen nicht konstruieren.
 */
private val toneMapper = ObjectMapper().registerKotlinModule()

fun List<ToneStep>.toJsonb(): JSONB = JSONB.jsonb(toneMapper.writeValueAsString(this))

fun JSONB?.toTonePlan(): List<ToneStep>? =
    this?.let { toneMapper.readValue<List<ToneStep>>(it.data()) }

/**
 * Die Fehlstart-FOLGE aus ihrer jsonb-Spalte - mit Rückwärtskompatibilität OHNE Migration.
 *
 * Bis zum 24.08.2026 war der Fehlstart-Ton ein EINZELTON und liegt in bestehenden Datenbanken
 * als jsonb-OBJEKT (`{"frequencyHz":200,"durationMillis":2000,...}`); seither schreibt der
 * Service immer ein ARRAY. Statt einer Migration, die jede Zeile anfassen müsste (und bei einem
 * Rollback wieder zurückmüsste), entscheidet hier die Gestalt des gespeicherten Werts: ein
 * Objekt wird als einelementige Folge mit Zeitpunkt 0 gelesen - der alte Ton klingt also
 * unverändert, sofort bei der Auslösung, und beim nächsten Speichern wandert er von selbst in
 * die neue Array-Form.
 *
 * Ein Array-Wert geht direkt durch; alles andere (Zahl, String, `null`-Literal) ist kaputter
 * Bestand und fliegt wie bisher beim Einlesen, statt still zu einem stummen Board zu werden.
 */
fun JSONB?.toToneSequence(): List<ToneStep>? =
    this?.let {
        val node = toneMapper.readTree(it.data())
        if (node.isObject) {
            val tone = toneMapper.treeToValue(node, CaptureTone::class.java)
            listOf(
                ToneStep(
                    offsetMillis = 0,
                    frequencyHz = tone.frequencyHz,
                    durationMillis = tone.durationMillis,
                    releaseMillis = tone.releaseMillis,
                    waveform = tone.waveform,
                )
            )
        } else {
            toneMapper.readValue<List<ToneStep>>(it.data())
        }
    }

fun CaptureTone.toJsonb(): JSONB = JSONB.jsonb(toneMapper.writeValueAsString(this))

fun JSONB?.toCaptureTone(): CaptureTone? =
    this?.let { toneMapper.readValue<CaptureTone>(it.data()) }

/**
 * Der Anzeige-Block des Startbildschirms aus seiner jsonb-Spalte (`event.timing_start_display`).
 *
 * Derselbe Mapper wie bei den Tönen: Es ist wieder eine Kotlin-Datenklasse, die der nackte
 * ObjectMapper nicht konstruieren könnte. null (Spalte nicht gesetzt) bleibt null und heißt
 * „eingebaute Vorgaben" - aufgelöst wird erst dort, wo die Boards bedient werden
 * (TimingOfficialTimeService.eventSettings), damit das Formular den Unterschied zwischen
 * „Standard" und „eigener Wert" weiterhin sieht.
 *
 * Anders als bei der Fehlstart-Folge gibt es hier keinen Alt-Bestand zu erkennen: die Spalte ist
 * am 24.08.2026 leer entstanden, jede gespeicherte Zeile hat von Anfang an diese Gestalt.
 */
fun StartDisplaySettings.toJsonb(): JSONB = JSONB.jsonb(toneMapper.writeValueAsString(this))

fun JSONB?.toStartDisplaySettings(): StartDisplaySettings? =
    this?.let { toneMapper.readValue<StartDisplaySettings>(it.data()) }

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
        pausedAtMillis = record.pausedAtMillis,
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
 *
 * Dazu kommt die aufgelaufene Pausendauer (`pause_shift_millis`): Wurde die Sequenz zwischendurch
 * angehalten, rückt die GANZE Kette um genau diese Summe nach hinten. Das ist der Grund, warum
 * die Verschiebung hier draufgerechnet und nicht in `started_at_millis` hineinaddiert wird - der
 * Startzeitpunkt bleibt der Startzeitpunkt, und weil die Verschiebung für alle Positionen
 * dieselbe ist, bleibt der Abstand zwischen zwei Booten unverändert.
 */
fun plannedStartMillis(record: TimingStartSequenceRecord, position: Int): Long? {
    val startedAt = record.startedAtMillis ?: return null
    val leadIn = record.leadInMillis ?: 0L
    // Not-null-Spalte mit Default; der jOOQ-Generator typisiert sie dennoch nullable (bekanntes
    // Muster, siehe leadInSeconds oben) - 0 ist hier zugleich der Datenbank-Default und die
    // richtige Bedeutung: nie pausiert, also nichts zu verschieben.
    val pauseShift = record.pauseShiftMillis ?: 0L
    return when (SequenceMode.valueOf(record.mode)) {
        SequenceMode.MASS -> startedAt + leadIn + pauseShift
        SequenceMode.INTERVAL -> startedAt + leadIn + pauseShift + position * (record.intervalMillis ?: 0L)
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
    place: Int?,
): OfficialTimeDto = OfficialTimeDto(
    competitionMatchTeam = record.competitionMatchTeam,
    event = record.event,
    startMillis = startMillis,
    finishMillis = finishMillis,
    computedMillis = record.computedMillis,
    overrideMillis = record.overrideMillis,
    penaltyMillis = record.penaltyMillis ?: 0L,
    penaltyNote = record.penaltyNote,
    resultStatus = OfficialTimeResultStatus.valueOf(record.resultStatus!!),
    effectiveMillis = effectiveMillis(record),
    dirty = record.dirty ?: false,
    pushedAt = record.pushedAt,
    place = place,
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
    place: Int?,
): OfficialTimeDto = OfficialTimeDto(
    competitionMatchTeam = teamId,
    event = eventId,
    startMillis = startMillis,
    finishMillis = finishMillis,
    computedMillis = null,
    overrideMillis = null,
    penaltyMillis = 0L,
    penaltyNote = null,
    resultStatus = OfficialTimeResultStatus.NONE,
    effectiveMillis = null,
    dirty = false,
    pushedAt = null,
    place = place,
)

/**
 * The [Timecode] to persist for an official time of [effectiveMillis].
 *
 * Parity with the results import is the point here: the value is rendered and then read back through
 * the very same [Parser.timecode] that `CompetitionExecutionService.updateMatchResult(-ByFile)` runs
 * on a time cell, so the stored `base_unit` / `millisecond_precision` cannot drift from what an
 * imported time of the same length would have produced. The base unit follows the magnitude (as a
 * hand-typed or exported time would).
 *
 * Die Millisekunden-Präzision folgt der eingestellten Genauigkeit der Veranstaltung
 * ([TimingPrecision] -> [TimingPrecisionLogic.timecodePrecision]): der Aufrufer übergibt
 * [effectiveMillis] bereits ABGESCHNITTEN, und die Stellenzahl des gerenderten Timecodes zeigt
 * genau diese Stufe - bei ZEHNTEL steht am Lauf "1:31.5", nicht "1:31.500".
 */
fun officialTimecode(effectiveMillis: Long, precision: TimingPrecision): Timecode {
    val baseUnit = when {
        effectiveMillis >= 3_600_000 -> Timecode.BaseUnit.HOURS
        effectiveMillis >= 60_000 -> Timecode.BaseUnit.MINUTES
        else -> Timecode.BaseUnit.SECONDS
    }
    val rendered = Timecode(effectiveMillis, baseUnit, TimingPrecisionLogic.timecodePrecision(precision)).toString()
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
    tonePlan = tonePlan.toTonePlan(),
    // Wie leadInSeconds eine not-null-Spalte mit Default, die jOOQ dennoch nullable typisiert.
    // Der Rückfall ist deshalb genau der Datenbank-Default (V202608242020): Fehlstart erlaubt -
    // ein Typ, dessen Spalte wider Erwarten leer ist, verliert den Rückruf nicht stillschweigend.
    falseStartEnabled = falseStartEnabled ?: true,
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
            tonePlan = tonePlan?.toJsonb(),
            falseStartEnabled = falseStartEnabled,
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

/**
 * Der Geräte-Reiter der Zeitnahme — und der zeigt ausschließlich POSTEN-Tokens.
 *
 * Seit Migration V202608250900 trägt dieselbe Tabelle auch Board-Tokens; dort ist station null
 * und board gesetzt (genau eines von beiden, per Check-Constraint). Diese Konvertierung wird
 * deshalb nur auf Posten-Tokens angewandt: [de.lambda9.ready2race.backend.app.timing.boundary.TimingDeviceTokenService.list]
 * holt sie über [TimingDeviceTokenRepo.getStationTokensByEvent] (`station is not null`), und die
 * Ausstell- wie die Posten-Share-Link-Antwort bauen ihren Record selbst mit gesetztem Posten.
 * Das `!!` trägt also die Abfrage, nicht die Hoffnung — Board-Tokens bekommen mit
 * [de.lambda9.ready2race.backend.app.eventInfo.entity.BoardShareLinkDto] ihre eigene Antwort.
 */
fun TimingDeviceTokenRecord.toDto(): TimingDeviceTokenDto = TimingDeviceTokenDto(
    id = id,
    event = event,
    station = station!!,
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
