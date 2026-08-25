package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.competitionExecution.control.CompetitionMatchTeamRepo
import de.lambda9.ready2race.backend.app.timing.boundary.TimingOfficialTimeService
import de.lambda9.ready2race.backend.app.timing.control.TimingOfficialTimeRepo
import de.lambda9.ready2race.backend.app.timing.entity.OfficialTimeOverrideRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationType
import de.lambda9.ready2race.backend.app.timingConfig.boundary.TimingConfigService
import de.lambda9.ready2race.backend.app.timingConfig.entity.EventTimingConfigRequest
import de.lambda9.ready2race.backend.app.timingConfig.entity.TimingPrecision
import de.lambda9.ready2race.backend.app.timingConfig.entity.TimingSystem
import de.lambda9.ready2race.backend.database.generated.tables.records.TimecodeRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.TIMECODE
import de.lambda9.ready2race.testing.testComprehension
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.jooq.Jooq
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull

/**
 * Die Genauigkeit der offiziellen Zeiten als Kette gegen echtes Postgres: die Übernahme schreibt
 * ABGESCHNITTEN an den Lauf (Vorgabe ZEHNTEL), die Rohdaten bleiben Millisekunden, und eine
 * Genauigkeits-Änderung rechnet alle eigenen Zeilen um, ohne sie als dirty/fremd zu missdeuten.
 */
class TimingPrecisionApplyTest {

    private val startMillis = 1755430000000L

    /** Start- und Zielposten plus ein Team - noch ohne Marken (Spiegel von TimingInstantApplyTest). */
    private data class Track(val startStation: UUID, val finishStation: UUID, val teamId: UUID)

    private fun prepareTrack(eventId: UUID, userId: UUID): App<Any?, Track> = KIO.comprehension {
        val startStation = !addTestStation(eventId, userId, TimingStationType.START)
        val finishStation = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val teamId = !createTestMatchTeam(eventId)
        KIO.ok(Track(startStation, finishStation, teamId))
    }

    private fun setPrecision(
        eventId: UUID,
        userId: UUID,
        precision: TimingPrecision,
    ): App<Any?, Unit> = TimingConfigService.updateEventTimingConfig(
        eventId,
        userId,
        EventTimingConfigRequest(
            timingSystem = TimingSystem.INTERN,
            startlistConfig = null,
            resultImportConfig = null,
            autoPull = false,
            intervalActiveSeconds = 5,
            intervalUpcomingSeconds = 60,
            watchBeforeMinutes = 15,
            watchAfterMinutes = 120,
            timingPrecision = precision,
            finishTone = null,
            splitTone = null,
            falseStartTone = null,
        ),
    ).map { }

    private fun teamTimecode(teamId: UUID): App<Any?, TimecodeRecord?> = Jooq.query {
        selectFrom(TIMECODE).where(TIMECODE.ID.eq(teamId)).fetchOne()
    }

    // ---------------------------------------------------------------- Vorgabe ZEHNTEL

    @Test
    fun defaultPrecisionWritesTenthsButKeepsRawMillis() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val track = !prepareTrack(eventId, userId)
        !addAssignedMark(eventId, userId, track.startStation, track.teamId, startMillis)
        !addAssignedMark(eventId, userId, track.finishStation, track.teamId, startMillis + 91_544L)

        // Am Lauf steht die abgeschnittene Zeit mit passender Stellenzahl ("1:31.5") ...
        val timecode = !teamTimecode(track.teamId)
        assertEquals(91_500L, timecode!!.time)
        assertEquals("ONE", timecode.millisecondPrecision)

        // ... die Rohdaten bleiben millisekundengenau, der Fingerabdruck trägt den Schnitt.
        val official = !TimingOfficialTimeRepo.getByTeam(track.teamId)
        assertEquals(91_544L, official!!.computedMillis)
        assertFalse(official.dirty!!)
        assertNotNull(official.appliedFingerprint)
    }

    // Zwei Boote 40 ms auseinander sind bei ZEHNTEL zeitgleich - exakt derselbe Wert am Lauf.
    @Test
    fun closeFinishTiesHonestlyOnTenths() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val startStation = !addTestStation(eventId, userId, TimingStationType.START)
        val finishStation = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val teams = !createTestMatchTeams(eventId, 2)
        !addAssignedMark(eventId, userId, startStation, teams[0], startMillis)
        !addAssignedMark(eventId, userId, startStation, teams[1], startMillis)
        !addAssignedMark(eventId, userId, finishStation, teams[0], startMillis + 91_510L)
        !addAssignedMark(eventId, userId, finishStation, teams[1], startMillis + 91_550L)

        val first = !teamTimecode(teams[0])
        val second = !teamTimecode(teams[1])
        assertEquals(91_500L, first!!.time)
        assertEquals(91_500L, second!!.time)
    }

    // ---------------------------------------------------------------- Genauigkeit umstellen

    // Einstellung ändern -> die Übernahme rechnet die eigenen Zeilen auf die neue Stufe um, ohne
    // sie als dirty/fremd zu missdeuten - der Fingerabdruck trägt den abgeschnittenen Wert.
    @Test
    fun changingPrecisionRecomputesOwnRowsWithoutDirty() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val track = !prepareTrack(eventId, userId)
        !addAssignedMark(eventId, userId, track.startStation, track.teamId, startMillis)
        !addAssignedMark(eventId, userId, track.finishStation, track.teamId, startMillis + 91_544L)
        assertEquals(91_500L, (!teamTimecode(track.teamId))!!.time)

        // Feiner: MILLISEKUNDE schreibt ohne weiteren Eingriff 1:31.544.
        !setPrecision(eventId, userId, TimingPrecision.MILLISEKUNDE)
        val fine = !teamTimecode(track.teamId)
        assertEquals(91_544L, fine!!.time)
        assertEquals("THREE", fine.millisecondPrecision)
        val afterFine = !TimingOfficialTimeRepo.getByTeam(track.teamId)
        assertFalse(afterFine!!.dirty!!)

        // Gröber: SEKUNDE schneidet auf 1:31 ab - nie kaufmännisch auf 1:32.
        !setPrecision(eventId, userId, TimingPrecision.SEKUNDE)
        val coarse = !teamTimecode(track.teamId)
        assertEquals(91_000L, coarse!!.time)
        assertEquals("NONE", coarse.millisecondPrecision)
        val afterCoarse = !TimingOfficialTimeRepo.getByTeam(track.teamId)
        assertFalse(afterCoarse!!.dirty!!)
        assertEquals(91_544L, afterCoarse.computedMillis)
    }

    // Eine unveränderte Genauigkeit stößt keine Nachrechnung an - der Speichern-Knopf der
    // Zeitnahme-Einstellungen darf die Läufe nicht bei jedem Klick anfassen.
    @Test
    fun savingUnchangedPrecisionRewritesNothing() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val track = !prepareTrack(eventId, userId)
        !addAssignedMark(eventId, userId, track.startStation, track.teamId, startMillis)
        !addAssignedMark(eventId, userId, track.finishStation, track.teamId, startMillis + 91_544L)
        val before = !CompetitionMatchTeamRepo.getById(track.teamId)

        !setPrecision(eventId, userId, TimingPrecision.ZEHNTEL)

        val after = !CompetitionMatchTeamRepo.getById(track.teamId)
        assertEquals(before!!.updatedAt, after!!.updatedAt)
    }

    // ---------------------------------------------------------------- Strafe vor dem Schnitt

    @Test
    fun penaltyIsAddedBeforeTruncating() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val track = !prepareTrack(eventId, userId)
        !addAssignedMark(eventId, userId, track.startStation, track.teamId, startMillis)
        !addAssignedMark(eventId, userId, track.finishStation, track.teamId, startMillis + 91_544L)

        !TimingOfficialTimeService.setOverride(
            eventId,
            track.teamId,
            OfficialTimeOverrideRequest(
                overrideMillis = null,
                penaltyMillis = 5_500L,
                penaltyNote = "Frühstart",
                resultStatus = null,
            ),
            userId,
        )

        // Erst die Summe (91_544 + 5_500 = 97_044), dann der Schnitt auf ZEHNTEL: 97_000.
        val timecode = !teamTimecode(track.teamId)
        assertEquals(97_000L, timecode!!.time)
        // Die Anzeige-Spalte der Strafe bleibt kaufmännisch gerundet (bestehende Konvention).
        val team = !CompetitionMatchTeamRepo.getById(track.teamId)
        assertEquals(6, team!!.penaltySeconds)
    }
}
