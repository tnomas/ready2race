package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.event.control.EventRepo
import de.lambda9.ready2race.backend.app.timing.boundary.TimingSequenceService
import de.lambda9.ready2race.backend.app.timing.boundary.TimingModeService
import de.lambda9.ready2race.backend.app.timing.boundary.TimingService
import de.lambda9.ready2race.backend.app.timing.control.TimingSequenceRepo
import de.lambda9.ready2race.backend.app.timing.control.TimingTimeMarkRepo
import de.lambda9.ready2race.backend.app.timing.entity.CreateSequenceRequest
import de.lambda9.ready2race.backend.app.timing.entity.SequenceMode
import de.lambda9.ready2race.backend.app.timing.entity.SequenceState
import de.lambda9.ready2race.backend.app.timing.entity.TimingError
import de.lambda9.ready2race.backend.app.timing.entity.TimingModeAssignmentRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingModeRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingStartGrouping
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationType
import de.lambda9.ready2race.backend.app.timingConfig.entity.TimingSystem
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.testing.testComprehension
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.orDie
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Der AUSDRÜCKLICHE Fehlstart (Rückruf) gegen echtes Postgres.
 *
 * Geprüft wird beides, was den Rückruf von seinen beiden Bausteinen unterscheidet: dass er am
 * Zeitnahmetyp abschaltbar ist (Timetrial im Rudersport ahndet mit Strafzeit, nicht mit Rückruf),
 * und dass er bei erlaubtem Typ WIRKLICH beides tut - die laufende Startsequenz abbrechen UND den
 * Versuch zurücknehmen. Genau die Kombination ist neu; die einzelnen Wege haben ihre eigenen
 * Tests (TimingSequenceServiceTest, TimingServiceTest).
 *
 * Die WebSocket-Nachricht selbst steht hier bewusst nicht auf dem Prüfstand: sie geht über
 * `AfterCommit` an den Broadcaster, dessen Zustellung TimingBroadcasterTest abdeckt.
 */
class TimingFalseStartActionTest {

    private fun setEventTimingSystem(eventId: UUID, system: TimingSystem): App<Any?, Unit> =
        KIO.comprehension {
            val event = (!EventRepo.get(eventId).orDie())!!
            !EventRepo.update(event) { timingSystem = system.name }.orDie()
            KIO.ok(Unit)
        }

    private fun modeRequest(name: String, falseStartEnabled: Boolean) = TimingModeRequest(
        name = name,
        withLaps = false,
        startGrouping = TimingStartGrouping.WELLE,
        intervalSeconds = null,
        leadInSeconds = 10,
        tonePlan = null,
        falseStartEnabled = falseStartEnabled,
    )

    /** Legt einen Typ an und hängt ihn an den Wettkampf der Vorrichtung. */
    private fun assignMode(
        eventId: UUID,
        userId: UUID,
        competitionId: UUID,
        falseStartEnabled: Boolean,
    ): App<Any?, UUID> = KIO.comprehension {
        val created = !TimingModeService.addMode(
            modeRequest("Typ-${UUID.randomUUID()}", falseStartEnabled),
            userId,
            eventId,
        )
        val modeId = (created as ApiResponse.Created).id
        !TimingModeService.upsertModeAssignment(
            TimingModeAssignmentRequest(competitionId, null, modeId),
            userId,
            eventId,
        )
        KIO.ok(modeId)
    }

    // ---------------------------------------------------------------- Der Schalter am Renntyp

    @Test
    fun theFlagRoundTripsAndDefaultsToEnabled() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()

        // Ohne ausdrückliche Angabe steht der Rückruf zur Verfügung - das ist der Normalfall am
        // Wellen- und Massenstart, und der Datenbank-Default (V202608242020) sagt dasselbe.
        val created = !TimingModeService.addMode(
            TimingModeRequest("Standard", false, TimingStartGrouping.WELLE, null, 10, null),
            userId,
            eventId,
        )
        val modeId = (created as ApiResponse.Created).id
        assertTrue((!TimingModeService.getModes(eventId)).data.single().falseStartEnabled)

        // Abschalten und wieder einschalten müssen beide über das Update ankommen: ein Schalter,
        // der nur in eine Richtung greift, ist am Renntag schlimmer als gar keiner.
        !TimingModeService.updateMode(modeRequest("Standard", falseStartEnabled = false), userId, modeId, eventId)
        assertEquals(false, (!TimingModeService.getModes(eventId)).data.single().falseStartEnabled)

        !TimingModeService.updateMode(modeRequest("Standard", falseStartEnabled = true), userId, modeId, eventId)
        assertEquals(true, (!TimingModeService.getModes(eventId)).data.single().falseStartEnabled)
    }

    // ---------------------------------------------------------------- Ablehnung

    @Test
    fun aModeWithoutFalseStartRejectsTheRecallAndChangesNothing() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !setEventTimingSystem(eventId, TimingSystem.INTERN)
        val fixture = !createTestMatchFixture(eventId)
        !assignMode(eventId, userId, fixture.competitionId, falseStartEnabled = false)

        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val markId = !addAssignedMark(eventId, userId, stationId, fixture.teamIds.single(), 1_000L)
        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.MASS, null, fixture.teamIds),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id

        assertKIOFails(TimingError.FalseStartDisabled) {
            TimingService.falseStart(fixture.setupMatchId, eventId, userId)
        }

        // Die Ablehnung muss VOR jedem Schreiben greifen: eine halb ausgeführte Rücknahme wäre am
        // Timetrial schlimmer als gar keine (Sequenz weg, Zeiten weg, Ahndung trotzdem falsch).
        assertEquals(SequenceState.ARMED.name, (!TimingSequenceRepo.get(sequenceId).orDie())!!.state)
        assertEquals("ACTIVE", (!TimingTimeMarkRepo.get(markId).orDie())!!.status)
    }

    @Test
    fun aMatchWithoutAnyModeRejectsTheRecall() = testComprehension {
        // Ohne wirksamen Typ ist gar nicht entschieden, wie hier gestartet wird - dann gibt es
        // auch nichts zurückzurufen. Dieselbe Antwort wie beim abgeschalteten Typ, weil sie
        // dasselbe bedeutet: an dieser Partie ist der Rückruf nicht vorgesehen.
        val (eventId, userId) = !createTestEventWithAdmin()
        !setEventTimingSystem(eventId, TimingSystem.INTERN)
        val fixture = !createTestMatchFixture(eventId)

        assertKIOFails(TimingError.FalseStartDisabled) {
            TimingService.falseStart(fixture.setupMatchId, eventId, userId)
        }
    }

    // ---------------------------------------------------------------- Der Rückruf selbst

    @Test
    fun anEnabledModeAbortsTheSequenceAndRetractsTheAttempt() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !setEventTimingSystem(eventId, TimingSystem.INTERN)
        val fixture = !createTestMatchFixture(eventId, teamCount = 2)
        !assignMode(eventId, userId, fixture.competitionId, falseStartEnabled = true)

        val startStation = !addTestStation(eventId, userId, TimingStationType.START)
        val finishStation = !addTestStation(eventId, userId, TimingStationType.FINISH)
        // Ein Boot ist schon gestartet und sogar schon durchs Ziel - beide Marken müssen gehen:
        // eine stehen gebliebene Zielzeit verrechnete sich sonst mit der nächsten Startmarke.
        val startMark = !addAssignedMark(eventId, userId, startStation, fixture.teamIds[0], 1_000L)
        val finishMark = !addAssignedMark(eventId, userId, finishStation, fixture.teamIds[0], 61_000L)

        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(startStation, SequenceMode.MASS, null, fixture.teamIds),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id
        !TimingSequenceService.startSequence(sequenceId, userId, eventId)

        !TimingService.falseStart(fixture.setupMatchId, eventId, userId)

        // Die Kette steht - sonst feuerte sie weitere Startmarken in den gerade zurückgeholten
        // Lauf hinein.
        assertEquals(SequenceState.ABORTED.name, (!TimingSequenceRepo.get(sequenceId).orDie())!!.state)
        // Und der ganze Versuch ist zurückgenommen, Ziel- wie Startmarke.
        assertEquals("RETRACTED", (!TimingTimeMarkRepo.get(startMark).orDie())!!.status)
        assertEquals("RETRACTED", (!TimingTimeMarkRepo.get(finishMark).orDie())!!.status)
        // Der Posten kann sofort neu scharfstellen: ein abgebrochener Lauf gibt seinen Posten frei.
        assertKIOSucceeds {
            TimingSequenceService.createSequence(
                CreateSequenceRequest(startStation, SequenceMode.MASS, null, fixture.teamIds),
                userId,
                eventId,
            )
        }
    }

    @Test
    fun aRecallBeforeTheFirstMarkSucceeds() = testComprehension {
        // Der wichtigste Fall überhaupt: zurückgerufen wird typischerweise, BEVOR eine Marke
        // gefallen ist. Es gibt dann nichts zurückzunehmen - der Aufruf muss trotzdem gelingen
        // (das Signal an die Anzeigen ist dann das Einzige, was die Boote erreicht).
        val (eventId, userId) = !createTestEventWithAdmin()
        !setEventTimingSystem(eventId, TimingSystem.INTERN)
        val fixture = !createTestMatchFixture(eventId)
        !assignMode(eventId, userId, fixture.competitionId, falseStartEnabled = true)

        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.MASS, null, fixture.teamIds),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id

        !TimingService.falseStart(fixture.setupMatchId, eventId, userId)

        assertEquals(SequenceState.ABORTED.name, (!TimingSequenceRepo.get(sequenceId).orDie())!!.state)
    }

    @Test
    fun aRecallWithoutAnyRunningSequenceStillRetracts() = testComprehension {
        // „Auch nach dem Start" - der Rückruf hängt nicht an einer laufenden Sequenz. Ein von Hand
        // gestarteter Lauf (Marken ohne Sequenz) muss sich genauso zurückrufen lassen.
        val (eventId, userId) = !createTestEventWithAdmin()
        !setEventTimingSystem(eventId, TimingSystem.INTERN)
        val fixture = !createTestMatchFixture(eventId)
        !assignMode(eventId, userId, fixture.competitionId, falseStartEnabled = true)

        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val markId = !addAssignedMark(eventId, userId, stationId, fixture.teamIds.single(), 1_000L)

        !TimingService.falseStart(fixture.setupMatchId, eventId, userId)

        assertEquals("RETRACTED", (!TimingTimeMarkRepo.get(markId).orDie())!!.status)
    }
}
