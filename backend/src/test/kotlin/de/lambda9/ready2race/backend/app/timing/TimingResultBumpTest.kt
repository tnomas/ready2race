package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.eventInfo.boundary.EventChangeMarker
import de.lambda9.ready2race.backend.app.timing.boundary.TimingOfficialTimeService
import de.lambda9.ready2race.backend.app.timing.boundary.TimingSequenceService
import de.lambda9.ready2race.backend.app.timing.boundary.TimingService
import de.lambda9.ready2race.backend.app.timing.control.TimingSequenceRepo
import de.lambda9.ready2race.backend.app.timing.entity.CreateSequenceRequest
import de.lambda9.ready2race.backend.app.timing.entity.OfficialTimeOverrideRequest
import de.lambda9.ready2race.backend.app.timing.entity.PushOfficialTimesRequest
import de.lambda9.ready2race.backend.app.timing.entity.SequenceMode
import de.lambda9.ready2race.backend.app.timing.entity.TimingAutoApplyRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationType
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.database.generated.tables.references.EVENT
import de.lambda9.ready2race.testing.testComprehension
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.orDie
import de.lambda9.tailwind.jooq.Jooq
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Die Echtzeit-Übernahme muss die öffentlichen Anzeigen (Athleten-Board, Ergebnisse,
 * Stream-Overlay, Dashboard) sofort erreichen: Jede Mutation, die tatsächlich an
 * `competition_match_team` geschrieben oder geräumt hat, löst genau EINEN
 * [EventChangeMarker]-Bump aus - und ein No-op (Idempotenz, Schalter aus, fremde Zeile)
 * bewusst KEINEN, sonst trommelt jeder Leerlauf alle Boards wach. Dasselbe Muster wie bei
 * den Laufzustands-Stempeln ([TimingMatchStampServiceTest]): HTTP-Wege bumpen im Request,
 * der Sequenz-Scheduler erst nach seinem Commit über das FireResult.
 */
class TimingResultBumpTest {

    private val startMillis = 1755430000000L
    private val finishMillis = startMillis + 90_000L
    private val LEAD_IN = 3000L

    /** Schaltet den Schalter direkt in der DB um - ohne den Nachzug von [TimingOfficialTimeService.setAutoApply]. */
    private fun setAutoApplyRaw(eventId: UUID, enabled: Boolean): App<Any?, Unit> = Jooq.query {
        update(EVENT).set(EVENT.TIMING_AUTO_APPLY, enabled).where(EVENT.ID.eq(eventId)).execute()
    }.orDie().map { }

    private data class Track(val startStation: UUID, val finishStation: UUID, val teamId: UUID)

    private fun prepareTrack(eventId: UUID, userId: UUID): App<Any?, Track> = KIO.comprehension {
        val startStation = !addTestStation(eventId, userId, TimingStationType.START)
        val finishStation = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val teamId = !createTestMatchTeam(eventId)
        KIO.ok(Track(startStation, finishStation, teamId))
    }

    // ---------------------------------------------------------------- Übernahme schreibt -> Bump

    @Test
    fun assigningTheFinishBumpsExactlyOnce() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val track = !prepareTrack(eventId, userId)
        // Die Startmarke bumpt bereits über den Laufzustands-Stempel - der Zähler beginnt danach.
        !addAssignedMark(eventId, userId, track.startStation, track.teamId, startMillis)

        val markerBefore = EventChangeMarker.current(eventId)
        !addAssignedMark(eventId, userId, track.finishStation, track.teamId, finishMillis)

        // Die Zuordnung hat das Ergebnis an den Lauf geschrieben - genau ein Bump, damit die
        // öffentlichen Anzeigen die neue Zeit sofort nachladen.
        assertEquals(markerBefore + 1, EventChangeMarker.current(eventId))
    }

    @Test
    fun retractingTheFinishBumpsExactlyOnce() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val track = !prepareTrack(eventId, userId)
        !addAssignedMark(eventId, userId, track.startStation, track.teamId, startMillis)
        val finishMark = !addAssignedMark(eventId, userId, track.finishStation, track.teamId, finishMillis)

        val markerBefore = EventChangeMarker.current(eventId)
        !TimingService.retractTimeMark(finishMark, eventId, userId)

        // Auch das Abräumen ist eine Ergebnis-Änderung am Lauf - die Anzeigen müssen die
        // verschwundene Zeit genauso sofort sehen wie eine neue.
        assertEquals(markerBefore + 1, EventChangeMarker.current(eventId))
    }

    @Test
    fun overrideBumpsOnWriteButNotOnRepeat() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val track = !prepareTrack(eventId, userId)
        !addAssignedMark(eventId, userId, track.startStation, track.teamId, startMillis)
        !addAssignedMark(eventId, userId, track.finishStation, track.teamId, finishMillis)

        val markerBefore = EventChangeMarker.current(eventId)
        val request = OfficialTimeOverrideRequest(
            overrideMillis = null,
            penaltyMillis = 5_000,
            penaltyNote = "Frühstart",
            resultStatus = null,
        )
        !TimingOfficialTimeService.setOverride(eventId, track.teamId, request, userId)
        assertEquals(markerBefore + 1, EventChangeMarker.current(eventId))

        // Dieselbe Strafe erneut gesetzt: Ziel-Stand unverändert, nichts wird geschrieben -
        // und ohne Schreibvorgang gibt es keinen Bump.
        !TimingOfficialTimeService.setOverride(eventId, track.teamId, request, userId)
        assertEquals(markerBefore + 1, EventChangeMarker.current(eventId))
    }

    // ---------------------------------------------------------------- Idempotenz -> kein Bump

    @Test
    fun recomputingAnUnchangedStateDoesNotBump() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val track = !prepareTrack(eventId, userId)
        !addAssignedMark(eventId, userId, track.startStation, track.teamId, startMillis)
        !addAssignedMark(eventId, userId, track.finishStation, track.teamId, finishMillis)

        val markerBefore = EventChangeMarker.current(eventId)
        val outcome = !TimingOfficialTimeService.recomputeAndApply(eventId, listOf(track.teamId), userId)

        // Der Stand wird gemeldet (die Boards folgen live), aber geschrieben wurde nichts.
        assertEquals(90_000L, outcome.officialTimes.single().computedMillis)
        assertFalse(outcome.resultsWritten)
        assertEquals(markerBefore, EventChangeMarker.current(eventId))

        // Auch der Rechen-Endpunkt als HTTP-Weg bleibt still, solange nichts zu schreiben ist.
        !TimingOfficialTimeService.computeOfficialTimes(eventId, userId, listOf(track.teamId))
        assertEquals(markerBefore, EventChangeMarker.current(eventId))
    }

    // ---------------------------------------------------------------- Schalter aus / Nachzug

    @Test
    fun switchOffCollectsSilentlyAndCatchUpBumpsOnce() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !setAutoApplyRaw(eventId, false)
        val track = !prepareTrack(eventId, userId)
        // Der Stempel-Bump der Startmarke gehört zum Laufzustand, nicht zum Ergebnis - der
        // Zähler beginnt danach.
        !addAssignedMark(eventId, userId, track.startStation, track.teamId, startMillis)

        val markerBefore = EventChangeMarker.current(eventId)
        !addAssignedMark(eventId, userId, track.finishStation, track.teamId, finishMillis)

        // Schalter aus: die Berechnung sammelt, aber am Lauf ändert sich nichts - kein Bump.
        assertEquals(markerBefore, EventChangeMarker.current(eventId))

        // Das Einschalten zieht den aufgelaufenen Stand einmalig nach - EIN Bump für den
        // ganzen Nachzug, nicht einer je Team.
        !TimingOfficialTimeService.setAutoApply(eventId, TimingAutoApplyRequest(enabled = true), userId)
        assertEquals(markerBefore + 1, EventChangeMarker.current(eventId))
    }

    @Test
    fun pushBumpsExactlyOnce() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !setAutoApplyRaw(eventId, false)
        val track = !prepareTrack(eventId, userId)
        !addAssignedMark(eventId, userId, track.startStation, track.teamId, startMillis)
        !addAssignedMark(eventId, userId, track.finishStation, track.teamId, finishMillis)

        val markerBefore = EventChangeMarker.current(eventId)
        !TimingOfficialTimeService.pushOfficialTimes(
            eventId,
            PushOfficialTimesRequest(listOf(track.teamId)),
            userId,
        )

        // Der manuelle Weg schreibt an den Lauf - derselbe eine Bump wie bei der Automatik.
        assertEquals(markerBefore + 1, EventChangeMarker.current(eventId))
    }

    // ---------------------------------------------------------------- Sequenz-Feuerung

    @Test
    fun firingThatCompletesAResultBumpsOnlyAfterCommit() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val startStation = !addTestStation(eventId, userId, TimingStationType.START)
        val finishStation = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val teamId = !createTestMatchTeam(eventId)
        // Zielzeit VOR dem Start (Zielposten erfasst zuerst): das Feuern der Startmarke
        // vervollständigt das Ergebnis.
        !addAssignedMark(eventId, userId, finishStation, teamId, finishMillis)

        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(startStation, SequenceMode.INTERVAL, 60000, listOf(teamId), LEAD_IN),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id
        !TimingSequenceService.startSequence(sequenceId, userId, eventId)
        // Muster aus TimingMatchStampServiceTest: der Startmoment wandert in die Vergangenheit,
        // damit der erste Slot fällig ist.
        val startedAt = startMillis
        !TimingSequenceRepo.update(sequenceId) { startedAtMillis = startedAt - LEAD_IN }.orDie()

        val markerBeforeFire = EventChangeMarker.current(eventId)
        val result = !TimingSequenceService.fireDueEntries()

        // Aus der Scheduler-Transaktion heraus wird nicht gebumpt - der Push ginge vor dem
        // Commit raus; das Ergebnis-Flag wandert stattdessen im FireResult nach draußen.
        assertTrue(result.fired.single().resultsWritten)
        assertEquals(markerBeforeFire, EventChangeMarker.current(eventId))

        // Nach dem Commit bündelt broadcastFireResult Stempel und Ergebnis derselben
        // Veranstaltung zu genau EINEM Bump.
        TimingSequenceService.broadcastFireResult(result)
        assertEquals(markerBeforeFire + 1, EventChangeMarker.current(eventId))
    }

    @Test
    fun firingWithoutAResultDoesNotBumpForResults() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val startStation = !addTestStation(eventId, userId, TimingStationType.START)
        val teamId = !createTestMatchTeam(eventId)

        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(startStation, SequenceMode.INTERVAL, 60000, listOf(teamId), LEAD_IN),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id
        !TimingSequenceService.startSequence(sequenceId, userId, eventId)
        !TimingSequenceRepo.update(sequenceId) {
            startedAtMillis = System.currentTimeMillis() - 500 - LEAD_IN
        }.orDie()

        val result = !TimingSequenceService.fireDueEntries()

        // Nur der Start ist gefallen - ohne Zielmarke entsteht kein Ergebnis; der Bump nach
        // dem Commit kommt dann allein vom Laufzustands-Stempel.
        assertTrue(result.fired.single().matchStamped)
        assertFalse(result.fired.single().resultsWritten)
    }
}
