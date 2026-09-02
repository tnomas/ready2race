package de.lambda9.ready2race.backend.app.liveDashboard

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.JEnv
import de.lambda9.ready2race.backend.app.event.control.EventRepo
import de.lambda9.ready2race.backend.app.liveDashboard.boundary.LiveDashboardService
import de.lambda9.ready2race.backend.app.liveDashboard.entity.LiveDashboardMatchDto
import de.lambda9.ready2race.backend.app.liveDashboard.entity.LiveDashboardMatchState
import de.lambda9.ready2race.backend.app.liveDashboard.entity.LiveDashboardScope
import de.lambda9.ready2race.backend.app.liveDashboard.entity.LiveDashboardSequenceState
import de.lambda9.ready2race.backend.app.timing.addTestStation
import de.lambda9.ready2race.backend.app.timing.boundary.TimingModeService
import de.lambda9.ready2race.backend.app.timing.boundary.TimingSequenceService
import de.lambda9.ready2race.backend.app.timing.boundary.TimingService
import de.lambda9.ready2race.backend.app.timing.control.TimingSequenceRepo
import de.lambda9.ready2race.backend.app.timing.createTestEventWithAdmin
import de.lambda9.ready2race.backend.app.timing.createTestMatchFixture
import de.lambda9.ready2race.backend.app.timing.entity.CreateSequenceRequest
import de.lambda9.ready2race.backend.app.timing.entity.SequenceEntryStatus
import de.lambda9.ready2race.backend.app.timing.entity.SequenceMode
import de.lambda9.ready2race.backend.app.timing.entity.TimingModeRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingStartGrouping
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationType
import de.lambda9.ready2race.backend.app.timingConfig.entity.TimingSystem
import de.lambda9.ready2race.backend.app.timingProfile.boundary.TimingProfileService
import de.lambda9.ready2race.backend.app.timingProfile.entity.TimingProfileAssignmentRequest
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.testing.kio.TestComprehensionScope
import de.lambda9.ready2race.testing.testComprehension
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.orDie
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

/**
 * Die Startsequenz im Schiedsrichter-Dashboard, am echten Postgres: Der Poll-Endpunkt muss die
 * aktive Sequenz eines Laufs samt Boots-Einträgen tragen und den Rückruf (Fehlstart) als Stempel
 * am Lauf zeigen - beides ist der Datenweg, über den Anzeigen OHNE Zeitnahme-Kanal mitkommen.
 *
 * Nur ein Datenbanktest belegt die Übersetzung `competition_match_team.id` → (Lauf, Meldung) im
 * Poll und den Sternchen-Join in `TimingSequenceEntryRepo.getActiveEntriesByEvent`; die
 * Zuordnungsregeln selbst prüft [LiveDashboardSequenceLogicTest] ohne Datenbank.
 */
class LiveDashboardSequenceTest {

    private fun setEventTimingSystem(eventId: UUID, system: TimingSystem): App<Any?, Unit> =
        KIO.comprehension {
            val event = (!EventRepo.get(eventId).orDie())!!
            !EventRepo.update(event) { timingSystem = system.name }.orDie()
            KIO.ok(Unit)
        }

    /** Ein Zeitnahmetyp mit erlaubtem Rückruf am Wettkampf der Vorrichtung - Voraussetzung für falseStart. */
    private fun assignRecallMode(eventId: UUID, userId: UUID, competitionId: UUID): App<Any?, Unit> =
        KIO.comprehension {
            val created = !TimingModeService.addMode(
                TimingModeRequest(
                    name = "Typ-${UUID.randomUUID()}",
                    startGrouping = TimingStartGrouping.WELLE,
                    intervalSeconds = null,
                    leadInSeconds = 10,
                    falseStartEnabled = true,
                ),
                userId,
                eventId,
            )
            val modeId = (created as ApiResponse.Created).id
            !TimingProfileService.upsertAssignment(
                eventId,
                userId,
                TimingProfileAssignmentRequest(competitionId, null, null, modeId),
            )
            KIO.ok(Unit)
        }

    private fun TestComprehensionScope<JEnv>.dashboardMatch(eventId: UUID, setupMatchId: UUID): LiveDashboardMatchDto {
        val dashboard = (!LiveDashboardService.getLiveDashboard(eventId, LiveDashboardScope.ALL)).dto
        return dashboard.matches.single { it.matchId == setupMatchId }
    }

    @Test
    fun theSequenceTravelsWithThePollFromArmedThroughRunningToPaused() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !setEventTimingSystem(eventId, TimingSystem.INTERN)
        val fixture = !createTestMatchFixture(eventId)
        val station = !addTestStation(eventId, userId, TimingStationType.START)

        // Ohne Sequenz: nichts auf der Karte.
        assertNull(dashboardMatch(eventId, fixture.setupMatchId).sequence)

        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(station, SequenceMode.MASS, null, fixture.teamIds),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id

        // Scharf: der Lauf ist an den Start gerufen, die Sequenz steht auf der Karte, aber es gibt
        // noch keinen Startzeitpunkt, auf den zu zählen wäre.
        val armed = dashboardMatch(eventId, fixture.setupMatchId)
        assertEquals(LiveDashboardMatchState.PREPARING, armed.state)
        val armedSequence = assertNotNull(armed.sequence)
        assertEquals(sequenceId, armedSequence.sequenceId)
        assertEquals(LiveDashboardSequenceState.ARMED, armedSequence.state)
        assertEquals(SequenceMode.MASS, armedSequence.mode)
        val armedEntry = assertNotNull(armed.teams.single().sequenceEntry)
        assertEquals(0, armedEntry.position)
        assertEquals(SequenceEntryStatus.PENDING, armedEntry.status)
        assertNull(armedEntry.plannedStartMillis)

        !TimingSequenceService.startSequence(sequenceId, userId, eventId)
        val record = (!TimingSequenceRepo.get(sequenceId).orDie())!!

        // Läuft: der geplante Start ist Sequenzstart + Vorlauf - dieselbe Rechnung wie beim Scheduler.
        val running = dashboardMatch(eventId, fixture.setupMatchId)
        assertEquals(LiveDashboardSequenceState.RUNNING, assertNotNull(running.sequence).state)
        assertNull(running.sequence?.pausedAtMillis)
        assertEquals(
            record.startedAtMillis!! + record.leadInMillis!!,
            assertNotNull(running.teams.single().sequenceEntry).plannedStartMillis,
        )

        !TimingSequenceService.pauseSequence(sequenceId, userId, eventId)

        // Pausiert: der Pausenbeginn reist mit, damit die Karte den Reststand einfrieren kann.
        val paused = dashboardMatch(eventId, fixture.setupMatchId)
        assertEquals(LiveDashboardSequenceState.PAUSED, assertNotNull(paused.sequence).state)
        assertNotNull(paused.sequence?.pausedAtMillis)
    }

    @Test
    fun aRecallLeavesItsStampUntilTheNextStart() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !setEventTimingSystem(eventId, TimingSystem.INTERN)
        val fixture = !createTestMatchFixture(eventId)
        !assignRecallMode(eventId, userId, fixture.competitionId)
        val station = !addTestStation(eventId, userId, TimingStationType.START)

        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(station, SequenceMode.MASS, null, fixture.teamIds),
            userId,
            eventId,
        )
        !TimingSequenceService.startSequence((created as ApiResponse.Created).id, userId, eventId)
        assertNull(dashboardMatch(eventId, fixture.setupMatchId).falseStartAt)

        !TimingService.falseStart(fixture.setupMatchId, eventId, userId)

        // Nach dem Rückruf: die Sequenz ist abgebrochen und damit von der Karte verschwunden, der
        // Lauf steht wieder am Start - und sagt jetzt, warum.
        val recalled = dashboardMatch(eventId, fixture.setupMatchId)
        assertNull(recalled.sequence)
        assertEquals(LiveDashboardMatchState.PREPARING, recalled.state)
        assertNotNull(recalled.falseStartAt)

        // Der nächste Start (hier der „Läuft"-Klick des Schiedsrichters) erledigt den Rückruf.
        !LiveDashboardService.markMatchStarted(eventId, fixture.setupMatchId, userId)
        val restarted = dashboardMatch(eventId, fixture.setupMatchId)
        assertEquals(LiveDashboardMatchState.RUNNING, restarted.state)
        assertNull(restarted.falseStartAt)
    }

    @Test
    fun anOrdinaryRetractionClearsTheStampBecauseItIsNoRecall() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !setEventTimingSystem(eventId, TimingSystem.INTERN)
        val fixture = !createTestMatchFixture(eventId)
        !assignRecallMode(eventId, userId, fixture.competitionId)
        val station = !addTestStation(eventId, userId, TimingStationType.START)
        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(station, SequenceMode.MASS, null, fixture.teamIds),
            userId,
            eventId,
        )
        !TimingSequenceService.startSequence((created as ApiResponse.Created).id, userId, eventId)
        !TimingService.falseStart(fixture.setupMatchId, eventId, userId)
        assertNotNull(dashboardMatch(eventId, fixture.setupMatchId).falseStartAt)

        !TimingService.retractMatchAttempt(fixture.setupMatchId, eventId, userId)

        assertNull(dashboardMatch(eventId, fixture.setupMatchId).falseStartAt)
    }
}
