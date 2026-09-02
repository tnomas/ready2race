package de.lambda9.ready2race.backend.app.liveDashboard

import de.lambda9.ready2race.backend.app.liveDashboard.boundary.LiveDashboardSequenceLogic
import de.lambda9.ready2race.backend.app.liveDashboard.entity.LiveDashboardSequenceState
import de.lambda9.ready2race.backend.app.timing.entity.ActiveSequenceEntry
import de.lambda9.ready2race.backend.app.timing.entity.SequenceEntryStatus
import de.lambda9.ready2race.backend.app.timing.entity.SequenceMode
import de.lambda9.ready2race.backend.app.timing.entity.SequenceState
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingStartSequenceEntryRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingStartSequenceRecord
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Die Zuordnung der aktiven Startsequenzen zu den Läufen des Schiedsrichter-Dashboards - ohne
 * Datenbank, an Datensätzen, wie das Repo sie liefert.
 */
class LiveDashboardSequenceLogicTest {

    private val t0 = LocalDateTime.of(2026, 9, 2, 10, 0)
    private val eventId = UUID.randomUUID()
    private val stationId = UUID.randomUUID()

    private fun sequence(
        state: SequenceState,
        mode: SequenceMode = SequenceMode.MASS,
        startedAtMillis: Long? = null,
        intervalMillis: Long? = null,
        leadInMillis: Long = 10_000,
        pausedAtMillis: Long? = null,
        pauseShiftMillis: Long = 0,
        updatedAt: LocalDateTime = t0,
    ) = TimingStartSequenceRecord(
        id = UUID.randomUUID(),
        event = eventId,
        station = stationId,
        mode = mode.name,
        intervalMillis = intervalMillis,
        state = state.name,
        startedAtMillis = startedAtMillis,
        createdAt = t0,
        createdBy = null,
        updatedAt = updatedAt,
        updatedBy = null,
        leadInMillis = leadInMillis,
        pausedAtMillis = pausedAtMillis,
        pauseShiftMillis = pauseShiftMillis,
    )

    private fun entry(
        sequence: TimingStartSequenceRecord,
        matchTeamId: UUID,
        position: Int,
        status: SequenceEntryStatus = SequenceEntryStatus.PENDING,
    ) = TimingStartSequenceEntryRecord(
        id = UUID.randomUUID(),
        sequence = sequence.id,
        competitionMatchTeam = matchTeamId,
        position = position,
        status = status.name,
        timeMark = null,
    )

    private fun row(sequence: TimingStartSequenceRecord, matchId: UUID, entry: TimingStartSequenceEntryRecord) =
        ActiveSequenceEntry(sequence = sequence, entry = entry, setupMatchId = matchId)

    @Test
    fun anArmedWaveHasNoPlannedStartsYet() {
        val match = UUID.randomUUID()
        val boatA = UUID.randomUUID()
        val boatB = UUID.randomUUID()
        val armed = sequence(SequenceState.ARMED)

        val result = LiveDashboardSequenceLogic.byMatch(
            listOf(row(armed, match, entry(armed, boatA, 0)), row(armed, match, entry(armed, boatB, 1)))
        )

        val shown = result.getValue(match)
        assertEquals(LiveDashboardSequenceState.ARMED, shown.sequence.state)
        assertEquals(SequenceMode.MASS, shown.sequence.mode)
        assertNull(shown.sequence.pausedAtMillis)
        assertEquals(setOf(boatA, boatB), shown.entriesByMatchTeam.keys)
        // Scharf heißt: noch kein Startzeitpunkt - der Countdown darf nichts zu zählen haben.
        assertTrue(shown.entriesByMatchTeam.values.all { it.plannedStartMillis == null })
        assertEquals(0, shown.entriesByMatchTeam.getValue(boatA).position)
    }

    @Test
    fun aRunningTimeTrialGivesEveryBoatItsOwnPlannedStart() {
        val match = UUID.randomUUID()
        val boatA = UUID.randomUUID()
        val boatB = UUID.randomUUID()
        val running = sequence(
            SequenceState.RUNNING,
            mode = SequenceMode.INTERVAL,
            startedAtMillis = 1_000_000,
            intervalMillis = 30_000,
            leadInMillis = 30_000,
        )

        val shown = LiveDashboardSequenceLogic.byMatch(
            listOf(
                row(running, match, entry(running, boatA, 0, SequenceEntryStatus.STARTED)),
                row(running, match, entry(running, boatB, 1)),
            )
        ).getValue(match)

        assertEquals(LiveDashboardSequenceState.RUNNING, shown.sequence.state)
        // Dieselbe Rechnung wie beim Scheduler: Start + Vorlauf + Position × Intervall.
        assertEquals(1_030_000, shown.entriesByMatchTeam.getValue(boatA).plannedStartMillis)
        assertEquals(1_060_000, shown.entriesByMatchTeam.getValue(boatB).plannedStartMillis)
        assertEquals(SequenceEntryStatus.STARTED, shown.entriesByMatchTeam.getValue(boatA).status)
        assertEquals(SequenceEntryStatus.PENDING, shown.entriesByMatchTeam.getValue(boatB).status)
    }

    @Test
    fun aPauseTravelsWithItsStartAndShiftsThePlannedStarts() {
        val match = UUID.randomUUID()
        val boat = UUID.randomUUID()
        val paused = sequence(
            SequenceState.PAUSED,
            startedAtMillis = 1_000_000,
            leadInMillis = 10_000,
            pausedAtMillis = 1_004_000,
            // Eine frühere Pause von 5 s ist schon verbucht - sie rückt den Start nach hinten.
            pauseShiftMillis = 5_000,
        )

        val shown = LiveDashboardSequenceLogic.byMatch(listOf(row(paused, match, entry(paused, boat, 0)))).getValue(match)

        assertEquals(LiveDashboardSequenceState.PAUSED, shown.sequence.state)
        assertEquals(1_004_000, shown.sequence.pausedAtMillis)
        assertEquals(1_015_000, shown.entriesByMatchTeam.getValue(boat).plannedStartMillis)
    }

    @Test
    fun aStalePauseStampNeverShowsOutsideThePausedState() {
        // Per Vertrag leert das Fortsetzen den Pausenbeginn; sollte er je stehen bleiben, darf
        // eine laufende Sequenz trotzdem nicht als pausiert erscheinen.
        val match = UUID.randomUUID()
        val running = sequence(SequenceState.RUNNING, startedAtMillis = 1_000_000, pausedAtMillis = 1_004_000)

        val shown = LiveDashboardSequenceLogic.byMatch(
            listOf(row(running, match, entry(running, UUID.randomUUID(), 0)))
        ).getValue(match)

        assertNull(shown.sequence.pausedAtMillis)
    }

    @Test
    fun oneSequenceOverTwoMatchesAppearsOnBothCardsWithOnlyTheirOwnBoats() {
        val matchA = UUID.randomUUID()
        val matchB = UUID.randomUUID()
        val boatA = UUID.randomUUID()
        val boatB = UUID.randomUUID()
        val shared = sequence(SequenceState.RUNNING, mode = SequenceMode.INTERVAL, startedAtMillis = 0, intervalMillis = 20_000, leadInMillis = 20_000)

        val result = LiveDashboardSequenceLogic.byMatch(
            listOf(row(shared, matchA, entry(shared, boatA, 0)), row(shared, matchB, entry(shared, boatB, 1)))
        )

        assertEquals(setOf(matchA, matchB), result.keys)
        assertEquals(setOf(boatA), result.getValue(matchA).entriesByMatchTeam.keys)
        assertEquals(setOf(boatB), result.getValue(matchB).entriesByMatchTeam.keys)
        // Die Position bleibt die der ganzen Sequenz - Boot B startet als Zweites, auch auf seiner Karte.
        assertEquals(1, result.getValue(matchB).entriesByMatchTeam.getValue(boatB).position)
        assertEquals(40_000, result.getValue(matchB).entriesByMatchTeam.getValue(boatB).plannedStartMillis)
    }

    @Test
    fun withTwoActiveSequencesOnOneMatchTheMostRecentlyTouchedWins() {
        val match = UUID.randomUUID()
        val boat = UUID.randomUUID()
        val older = sequence(SequenceState.ARMED, updatedAt = t0)
        val newer = sequence(SequenceState.RUNNING, startedAtMillis = 5_000, updatedAt = t0.plusMinutes(1))
        val onlyInOlder = UUID.randomUUID()

        val shown = LiveDashboardSequenceLogic.byMatch(
            listOf(
                row(older, match, entry(older, boat, 0)),
                row(older, match, entry(older, onlyInOlder, 1)),
                row(newer, match, entry(newer, boat, 0)),
            )
        ).getValue(match)

        assertEquals(newer.id, shown.sequence.sequenceId)
        assertEquals(LiveDashboardSequenceState.RUNNING, shown.sequence.state)
        // Ein Boot, das nur in der verdrängten Sequenz steht, bekommt keinen Eintrag - lieber eine
        // Lücke als zwei Wahrheiten auf einer Karte.
        assertEquals(setOf(boat), shown.entriesByMatchTeam.keys)
    }

    @Test
    fun nothingActiveMeansNothingShown() {
        assertTrue(LiveDashboardSequenceLogic.byMatch(emptyList()).isEmpty())
    }
}
