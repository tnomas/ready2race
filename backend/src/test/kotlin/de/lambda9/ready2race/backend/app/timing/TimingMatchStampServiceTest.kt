package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.JEnv
import de.lambda9.ready2race.backend.app.competitionExecution.control.CompetitionMatchRepo
import de.lambda9.ready2race.backend.app.competitionExecution.control.CompetitionMatchTeamRepo
import de.lambda9.ready2race.backend.app.eventInfo.boundary.EventChangeMarker
import de.lambda9.ready2race.backend.app.eventSchedule.boundary.ScheduleChainService
import de.lambda9.ready2race.backend.app.timing.boundary.TimingMatchStampLogic
import de.lambda9.ready2race.backend.app.timing.boundary.TimingSequenceService
import de.lambda9.ready2race.backend.app.timing.boundary.TimingService
import de.lambda9.ready2race.backend.app.timing.control.TimingSequenceRepo
import de.lambda9.ready2race.backend.app.timing.entity.CreateSequenceRequest
import de.lambda9.ready2race.backend.app.timing.entity.FireResult
import de.lambda9.ready2race.backend.app.timing.entity.SequenceMode
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationType
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionMatchRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.EventScheduleSlotRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_MATCH
import de.lambda9.ready2race.backend.database.generated.tables.references.EVENT_SCHEDULE_SLOT
import de.lambda9.ready2race.backend.database.insert
import de.lambda9.ready2race.backend.database.select
import de.lambda9.ready2race.testing.kio.TestComprehensionScope
import de.lambda9.ready2race.testing.testComprehension
import de.lambda9.tailwind.core.extensions.kio.orDie
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Die Laufzustands-Stempel der internen Zeitnahme gegen ein echtes Postgres: Sequenz einrichten
 * ruft an den Start (`activated_at`), die erste Startmarke stempelt den Ist-Start (`started_at` =
 * Markenzeit), die Versuchs-Rücknahme nimmt nur den eigenen Stempel zurück - und `finished_at`
 * bleibt in JEDEM Fall unangetastet (das Beenden gehört dem Schiedsrichter, daran hängen Kette
 * und Folgerunden-Automatik).
 */
class TimingMatchStampServiceTest {

    private val LEAD_IN = 3000L

    /** Ein fester Handstempel mit Mikrosekunden-Anteil - überlebt den DB-Roundtrip exakt. */
    private val refereeStamp = LocalDateTime.of(2026, 8, 23, 9, 0, 0, 123_456_000)

    // ------------------------------------------------------------------ Aktivierung (Punkt 1)

    @Test
    fun createSequenceCallsItsMatchesToTheStart() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val teamA = !createTestMatchTeam(eventId)
        val teamB = !createTestMatchTeam(eventId)
        val uninvolved = !createTestMatchTeam(eventId)

        val markerBefore = EventChangeMarker.current(eventId)
        !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.INTERVAL, 60000, listOf(teamA, teamB), LEAD_IN),
            userId,
            eventId,
        )

        listOf(teamA, teamB).forEach { teamId ->
            val match = matchOfTeam(teamId)
            assertNotNull(match.activatedAt)
            assertNull(match.startedAt)
            assertNull(match.finishedAt)
        }
        // Eine Partie außerhalb der Sequenz geht die Zeitnahme nichts an.
        assertNull(matchOfTeam(uninvolved).activatedAt)
        // Der Bump macht den neuen Zustand für die öffentlichen Anzeigen sofort sichtbar.
        assertTrue(EventChangeMarker.current(eventId) > markerBefore)
    }

    @Test
    fun createSequenceNeverMovesAnExistingActivation() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val teamId = !createTestMatchTeam(eventId)
        presetMatch(teamId) { activatedAt = refereeStamp }

        val markerBefore = EventChangeMarker.current(eventId)
        !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.INTERVAL, 60000, listOf(teamId), LEAD_IN),
            userId,
            eventId,
        )

        // Die Zeitnahme ruft an den Start, sie rückt keine bestehende Aktivierung vor - und ohne
        // Stempel gibt es auch keinen Bump.
        assertEquals(refereeStamp, matchOfTeam(teamId).activatedAt)
        assertEquals(markerBefore, EventChangeMarker.current(eventId))
    }

    // ------------------------------------------------------------------ Ist-Start (Punkt 2)

    @Test
    fun firingTheFirstMarkStampsTheStartWithTheMarkTime() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val teamId = !createTestMatchTeam(eventId)

        val (result, firstMarkMillis) = armAndFire(eventId, userId, stationId, listOf(teamId))

        assertTrue(result.fired.single().matchStamped)
        val match = matchOfTeam(teamId)
        // Der Stempel trägt die MARKENZEIT (geplanter Startmoment), nicht die Uhrzeit des Laufs.
        assertEquals(TimingMatchStampLogic.stampFor(firstMarkMillis), match.startedAt)
        assertNotNull(match.activatedAt)
        assertNull(match.finishedAt)
    }

    @Test
    fun onlyTheFirstBoatOfAMatchStampsTheStart() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val teams = !createTestMatchTeams(eventId, 2)

        // Beide Boote derselben Partie in einer Intervall-Sequenz; beide Einträge sind fällig
        // und feuern im selben Lauf.
        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.INTERVAL, 1000, teams, LEAD_IN),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id
        !TimingSequenceService.startSequence(sequenceId, userId, eventId)
        val startedAt = System.currentTimeMillis() - LEAD_IN - 1500
        !TimingSequenceRepo.update(sequenceId) { startedAtMillis = startedAt }.orDie()

        val result = !TimingSequenceService.fireDueEntries()

        // Nur die ERSTE Marke der Partie stempelt; die zweite trifft auf einen gesetzten
        // Ist-Start und lässt ihn stehen.
        assertEquals(listOf(true, false), result.fired.map { it.matchStamped })
        assertEquals(
            TimingMatchStampLogic.stampFor(startedAt + LEAD_IN),
            matchOfTeam(teams.first()).startedAt,
        )
    }

    @Test
    fun refereeStartIsNeverMovedByTheTiming() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val teamId = !createTestMatchTeam(eventId)
        presetMatch(teamId) { activatedAt = refereeStamp; startedAt = refereeStamp }

        val (result, _) = armAndFire(eventId, userId, stationId, listOf(teamId))

        assertFalse(result.fired.single().matchStamped)
        assertEquals(refereeStamp, matchOfTeam(teamId).startedAt)
    }

    @Test
    fun assigningAStartMarkStampsTheStart() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val startStation = !addTestStation(eventId, userId, TimingStationType.START)
        val finishStation = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val teamId = !createTestMatchTeam(eventId)
        val otherTeam = !createTestMatchTeam(eventId)

        // Eine Zielmarke allein startet nichts.
        !addAssignedMark(eventId, userId, finishStation, otherTeam, 1_755_950_500_000L)
        val otherMatch = matchOfTeam(otherTeam)
        assertNull(otherMatch.startedAt)
        assertNull(otherMatch.activatedAt)

        // Die zugeordnete Startmarke dagegen ist der Ist-Start - der Zielposten-Weg "Zeit nehmen
        // und zuordnen in einer Geste" läuft über genau diesen Pfad.
        val markMillis = 1_755_950_400_123L
        !addAssignedMark(eventId, userId, startStation, teamId, markMillis)
        val match = matchOfTeam(teamId)
        assertEquals(TimingMatchStampLogic.stampFor(markMillis), match.startedAt)
        // Gestartet impliziert an den Start gerufen - wie beim entdeckten Start des Abrufpfads.
        assertNotNull(match.activatedAt)
        assertNull(match.finishedAt)
    }

    // ------------------------------------------------------------------ Rücknahme (Punkt 3)

    @Test
    fun retractingTheAttemptClearsOwnStampButKeepsActivation() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val teamId = !createTestMatchTeam(eventId)
        val setupMatchId = matchOfTeam(teamId).competitionSetupMatch!!

        armAndFire(eventId, userId, stationId, listOf(teamId))
        assertNotNull(matchOfTeam(teamId).startedAt)

        val markerBefore = EventChangeMarker.current(eventId)
        !TimingService.retractMatchAttempt(setupMatchId, eventId, userId)

        val match = matchOfTeam(teamId)
        // Zurück auf "In Vorbereitung": der eigene Ist-Start fällt, die Aktivierung bleibt -
        // die Partie ist weiterhin an den Start gerufen.
        assertNull(match.startedAt)
        assertNotNull(match.activatedAt)
        assertNull(match.finishedAt)
        assertTrue(EventChangeMarker.current(eventId) > markerBefore)
    }

    @Test
    fun retractingTheAttemptKeepsARefereeStamp() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val teamId = !createTestMatchTeam(eventId)
        val setupMatchId = matchOfTeam(teamId).competitionSetupMatch!!

        // Der Schiedsrichter hat von Hand gestempelt, die Zeitnahme hat trotzdem Marken erfasst.
        presetMatch(teamId) { activatedAt = refereeStamp; startedAt = refereeStamp }
        !addAssignedMark(eventId, userId, stationId, teamId, 1_755_950_400_123L)

        !TimingService.retractMatchAttempt(setupMatchId, eventId, userId)

        // Die Marken sind zurückgenommen, der fremde Stempel steht.
        assertEquals(refereeStamp, matchOfTeam(teamId).startedAt)
    }

    @Test
    fun retractingTheAttemptFindsTheStampOfAnAlreadyRetractedMark() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val teamId = !createTestMatchTeam(eventId)
        val setupMatchId = matchOfTeam(teamId).competitionSetupMatch!!

        val markMillis = 1_755_950_400_123L
        val markId = !addAssignedMark(eventId, userId, stationId, teamId, markMillis)
        assertEquals(TimingMatchStampLogic.stampFor(markMillis), matchOfTeam(teamId).startedAt)

        // Die Einzelkorrektur ist bewusst asymmetrisch: die Rücknahme der letzten Startmarke
        // lässt den Ist-Start STEHEN (kein Neustart der Partie) ...
        !TimingService.retractTimeMark(markId, eventId, userId)
        assertNotNull(matchOfTeam(teamId).startedAt)

        // ... erst die Versuchs-Rücknahme nimmt ihn zurück - auch dann, wenn keine aktive Marke
        // mehr übrig ist: die Provenienz-Menge umfasst ALLE Startmarken der Partie.
        !TimingService.retractMatchAttempt(setupMatchId, eventId, userId)
        assertNull(matchOfTeam(teamId).startedAt)
    }

    @Test
    fun reactivatingTheStartMarkRestoresTheStamp() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val teamId = !createTestMatchTeam(eventId)
        val setupMatchId = matchOfTeam(teamId).competitionSetupMatch!!

        val markMillis = 1_755_950_400_123L
        val markId = !addAssignedMark(eventId, userId, stationId, teamId, markMillis)
        !TimingService.retractMatchAttempt(setupMatchId, eventId, userId)
        assertNull(matchOfTeam(teamId).startedAt)

        // Das Gegenstück zur Rücknahme: mit der Marke lebt auch der Ist-Start wieder auf.
        !TimingService.reactivateTimeMark(markId, eventId, userId)
        assertEquals(TimingMatchStampLogic.stampFor(markMillis), matchOfTeam(teamId).startedAt)
    }

    // ------------------------------------------------------------------ finished_at (Punkt 4)

    @Test
    fun finishedMatchesAreNeverTouched() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val teamId = !createTestMatchTeam(eventId)

        // Beendet wie vom Schiedsrichter hinterlassen: finished_at gesetzt, Aktivierung abgeräumt.
        presetMatch(teamId) { finishedAt = refereeStamp }

        val (result, _) = armAndFire(eventId, userId, stationId, listOf(teamId))

        assertFalse(result.fired.single().matchStamped)
        val match = matchOfTeam(teamId)
        // Kein Stempel stellt einen beendeten Lauf wieder als laufend dar - und finished_at
        // selbst schreibt die Zeitnahme ohnehin nie.
        assertNull(match.activatedAt)
        assertNull(match.startedAt)
        assertEquals(refereeStamp, match.finishedAt)
    }

    // ------------------------------------------------------------------ Kette (Punkt 6)

    /**
     * Ein von der Zeitnahme gestempelter Lauf verhält sich in der Aktivierungskette exakt wie ein
     * von Hand gestempelter: Er blockiert als "Läuft" das Vorrücken seiner Startgruppe, und die
     * Stempel selbst stoßen die Kette NICHT an (kein resumeIfParked aus der Zeitnahme - nur das
     * Beenden, Runden-Setzen und Slot-Überspringen rücken vor).
     */
    @Test
    fun timingStampsBlockTheChainLikeAnyStartAndNeverAdvanceIt() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val teamFront = !createTestMatchTeam(eventId)
        val teamNext = !createTestMatchTeam(eventId)
        val frontMatch = matchOfTeam(teamFront).competitionSetupMatch!!
        val nextMatch = matchOfTeam(teamNext).competitionSetupMatch!!

        val day = LocalDateTime.of(2026, 8, 23, 10, 0)
        scheduleSlot(eventId, day, frontMatch)
        scheduleSlot(eventId, day.plusMinutes(10), nextMatch)

        // Die Zeitnahme startet den vorderen Lauf ...
        armAndFire(eventId, userId, stationId, listOf(teamFront))
        assertNotNull(matchOfTeam(teamFront).startedAt)

        // ... und der hintere bleibt ungerufen: die Stempel haben die Kette nicht angestoßen.
        assertNull(matchOfTeam(teamNext).activatedAt)

        // Auch ein expliziter Kettenlauf rückt nicht vor - der laufende Lauf IST die Front,
        // exakt wie bei einem Handstempel.
        !ScheduleChainService.decideAndActivate(eventId, userId)
        assertNull(matchOfTeam(teamNext).activatedAt)

        // Gegenprobe, damit der Aufbau nicht leer testet: Ist der vordere Lauf beendet, rückt
        // dieselbe Kette den hinteren an den Start.
        presetMatch(teamFront) { activatedAt = null; startedAt = null; finishedAt = refereeStamp }
        !ScheduleChainService.decideAndActivate(eventId, userId)
        assertNotNull(matchOfTeam(teamNext).activatedAt)
    }

    // ------------------------------------------------------------------ Vorrichtung

    private fun TestComprehensionScope<JEnv>.matchOfTeam(teamId: UUID): CompetitionMatchRecord {
        val team = (!CompetitionMatchTeamRepo.getById(teamId).orDie())!!
        return (!COMPETITION_MATCH.select { COMPETITION_SETUP_MATCH.eq(team.competitionMatch!!) }).single()
    }

    /** Setzt Laufzustands-Felder direkt, wie es Schiedsrichter-Wege außerhalb der Zeitnahme tun. */
    private fun TestComprehensionScope<JEnv>.presetMatch(
        teamId: UUID,
        f: CompetitionMatchRecord.() -> Unit,
    ) {
        !CompetitionMatchRepo.update(matchOfTeam(teamId).competitionSetupMatch!!, f).orDie()
    }

    /**
     * Richtet eine Sequenz für [teams] ein, startet sie und macht den ersten Slot fällig - gibt
     * das Feuer-Ergebnis und den Zeitstempel der ersten Marke zurück.
     */
    private fun TestComprehensionScope<JEnv>.armAndFire(
        eventId: UUID,
        userId: UUID,
        stationId: UUID,
        teams: List<UUID>,
    ): Pair<FireResult, Long> {
        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.INTERVAL, 60000, teams, LEAD_IN),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id
        !TimingSequenceService.startSequence(sequenceId, userId, eventId)
        // Der Scheduler gehört der Wanduhr - der Test verschiebt stattdessen den Startmoment der
        // Sequenz in die Vergangenheit, damit genau der erste Slot fällig ist (Muster aus
        // TimingSequenceServiceTest).
        val startedAt = System.currentTimeMillis() - 500 - LEAD_IN
        !TimingSequenceRepo.update(sequenceId) { startedAtMillis = startedAt }.orDie()
        val result = !TimingSequenceService.fireDueEntries()
        return result to (startedAt + LEAD_IN)
    }

    private fun TestComprehensionScope<JEnv>.scheduleSlot(
        eventId: UUID,
        startTime: LocalDateTime,
        setupMatchId: UUID,
    ) {
        !EVENT_SCHEDULE_SLOT.insert(
            EventScheduleSlotRecord(
                id = UUID.randomUUID(),
                event = eventId,
                startTime = startTime,
                competitionSetupMatch = setupMatchId,
                createdAt = LocalDateTime.now(),
                updatedAt = LocalDateTime.now(),
            )
        )
    }
}
