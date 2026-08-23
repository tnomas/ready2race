package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.competitionExecution.control.CompetitionMatchTeamRepo
import de.lambda9.ready2race.backend.app.timing.boundary.TimingBroadcaster
import de.lambda9.ready2race.backend.app.timing.boundary.TimingService
import de.lambda9.ready2race.backend.app.timing.control.TimingAssignmentRepo
import de.lambda9.ready2race.backend.app.timing.control.TimingOfficialTimeRepo
import de.lambda9.ready2race.backend.app.timing.control.TimingTimeMarkRepo
import de.lambda9.ready2race.backend.app.timing.entity.*
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingTimeMarkRecord
import de.lambda9.ready2race.testing.testComprehension
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class TimeMarkServiceTest {

    @Test
    fun createIsIdempotent() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)
        val markId = UUID.randomUUID()
        val request = CreateTimeMarkRequest(id = markId, station = stationId, timestampMillis = 1755430000000)

        !TimingService.createTimeMark(request, userId, eventId)
        !TimingService.createTimeMark(request, userId, eventId) // second call must succeed, no duplicate

        val marks = !TimingTimeMarkRepo.getByEvent(eventId)
        assertEquals(1, marks.size)
        assertEquals(markId, marks.first().id)
    }

    @Test
    fun createIfAbsentIsRaceSafe() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)
        val markId = UUID.randomUUID()
        val record = TimingTimeMarkRecord(
            id = markId,
            event = eventId,
            station = stationId,
            timestampMillis = 1755430000000,
            source = "APP_USER",
            status = "ACTIVE",
            createdAt = LocalDateTime.now(),
            createdBy = userId,
        )

        // Simulates the loser of a concurrent-insert race: the row already exists
        // (e.g. inserted by another request with the same client-generated id),
        // so this second insert must hit ON CONFLICT DO NOTHING instead of
        // throwing a primary-key-violation defect.
        !TimingTimeMarkRepo.createIfAbsent(record)
        !TimingTimeMarkRepo.createIfAbsent(record)

        val marks = !TimingTimeMarkRepo.getByEvent(eventId)
        assertEquals(1, marks.size)
        assertEquals(markId, marks.first().id)
    }

    // The broadcast is guarded by `if (inserted > 0)`, so neither the idempotent fast path
    // (`exists` == true, asserted here) nor the loser of a real insert race (same guard, see
    // createIfAbsentIsRaceSafe) emits a second message. The race-loser variant itself cannot be
    // provoked from a single transaction - TimingSocketTest covers it with two concurrent requests.
    @Test
    fun duplicateCreateBroadcastsOnlyOnce() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)
        val received = TimingBroadcasterTest.concurrentList()
        val subscription = TimingBroadcaster.subscribe(eventId) { received.add(it) }

        try {
            val request = CreateTimeMarkRequest(UUID.randomUUID(), stationId, 1755430000000)
            !TimingService.createTimeMark(request, userId, eventId)
            !TimingService.createTimeMark(request, userId, eventId)

            runBlocking {
                TimingBroadcasterTest.awaitSize(received, 1)
                delay(200)
            }
            assertEquals(1, received.size, "duplicate create must not broadcast again: $received")
            assertTrue(received.single().contains("timeMarkCreated"))
        } finally {
            TimingBroadcaster.unsubscribe(subscription)
        }
    }

    @Test
    fun retractKeepsMark() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)
        val markId = UUID.randomUUID()
        !TimingService.createTimeMark(CreateTimeMarkRequest(markId, stationId, 1755430000000), userId, eventId)

        !TimingService.retractTimeMark(markId, eventId, userId)

        val mark = !TimingTimeMarkRepo.get(markId)
        assertNotNull(mark)
        assertEquals("RETRACTED", mark.status)
        assertEquals(userId, mark.updatedBy)
        assertNotNull(mark.updatedAt)
    }

    @Test
    fun retractFailsForUnknownTimeMark() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()

        assertKIOFails(TimingError.TimeMarkNotFound) {
            TimingService.retractTimeMark(UUID.randomUUID(), eventId, userId)
        }
    }

    // NOTE: full team-assignment round-trip coverage (upsert + detach against a
    // real competition_match_team) lives in TimingStateTest, which owns the
    // createTestMatchTeam fixture that builds the competition_setup/-match chain.
    @Test
    fun assignFailsForUnknownTimeMark() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()

        assertKIOFails(TimingError.TimeMarkNotFound) {
            TimingService.assignTimeMark(AssignTimeMarkRequest(UUID.randomUUID()), userId, UUID.randomUUID(), eventId)
        }
    }

    @Test
    fun assignFailsForUnknownTeam() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)
        val markId = UUID.randomUUID()
        !TimingService.createTimeMark(CreateTimeMarkRequest(markId, stationId, 1755430000000), userId, eventId)

        assertKIOFails(TimingError.TeamNotFound) {
            TimingService.assignTimeMark(AssignTimeMarkRequest(UUID.randomUUID()), userId, markId, eventId)
        }
    }

    @Test
    fun assignFailsForTeamFromDifferentEvent() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val (otherEventId, _) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)
        val markId = UUID.randomUUID()
        !TimingService.createTimeMark(CreateTimeMarkRequest(markId, stationId, 1755430000000), userId, eventId)
        val teamFromOtherEvent = !createTestMatchTeam(otherEventId)

        assertKIOFails(TimingError.EventMismatch) {
            TimingService.assignTimeMark(AssignTimeMarkRequest(teamFromOtherEvent), userId, markId, eventId)
        }
    }

    @Test
    fun detachWithoutExistingAssignmentSucceeds() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)
        val markId = UUID.randomUUID()
        !TimingService.createTimeMark(CreateTimeMarkRequest(markId, stationId, 1755430000000), userId, eventId)

        !TimingService.assignTimeMark(AssignTimeMarkRequest(null), userId, markId, eventId)

        val assignment = !TimingAssignmentRepo.getByTimeMark(markId)
        assertNull(assignment)
    }

    // ------------------------------------------------- Bündel-Rücknahme des ganzen Versuchs (Board)

    @Test
    fun retractMatchAttemptRetractsAllMarksOfThatMatchOnly() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val startStation = !addTestStation(eventId, userId, TimingStationType.START)
        val finishStation = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val fixture = !createTestMatchFixture(eventId, teamCount = 2)
        val (teamA, teamB) = fixture.teamIds
        // Eine zweite Partie derselben Veranstaltung - deren Marken müssen stehen bleiben.
        val otherTeam = !createTestMatchTeam(eventId)

        val startA = !addAssignedMark(eventId, userId, startStation, teamA, 1755430000000)
        val startB = !addAssignedMark(eventId, userId, startStation, teamB, 1755430001000)
        val finishA = !addAssignedMark(eventId, userId, finishStation, teamA, 1755430090000)
        val otherStart = !addAssignedMark(eventId, userId, startStation, otherTeam, 1755430002000)

        // Die Echtzeit-Übernahme hat Team A ein offizielles Ergebnis an den Lauf geschrieben -
        // genau das muss die Versuch-Rücknahme wieder abräumen.
        val teamABefore = !CompetitionMatchTeamRepo.getById(teamA)
        assertNotNull(teamABefore!!.timecode)

        !TimingService.retractMatchAttempt(fixture.setupMatchId, eventId, userId)

        // Der ganze Versuch geht zurück: Start- UND Zielmarken der Partie.
        assertEquals("RETRACTED", (!TimingTimeMarkRepo.get(startA))!!.status)
        assertEquals("RETRACTED", (!TimingTimeMarkRepo.get(startB))!!.status)
        assertEquals("RETRACTED", (!TimingTimeMarkRepo.get(finishA))!!.status)
        // Die fremde Partie bleibt unangetastet.
        assertEquals("ACTIVE", (!TimingTimeMarkRepo.get(otherStart))!!.status)
        // Die Zuordnungen überleben die Rücknahme (wie bei der Einzel-Rücknahme) - eine
        // Reaktivierung stellt den Versuch samt Boot wieder her.
        assertNotNull(!TimingAssignmentRepo.getByTimeMark(startA))
        assertNotNull(!TimingAssignmentRepo.getByTimeMark(finishA))
        // Die Echtzeit-Übernahme hat die offizielle Zeit mit abgeräumt: ohne Marken kein
        // berechneter Wert mehr - und das Ergebnis ist vom Lauf verschwunden (Phase-A-Mechanik).
        val official = !TimingOfficialTimeRepo.getByTeam(teamA)
        assertNull(official!!.computedMillis)
        val teamAAfter = !CompetitionMatchTeamRepo.getById(teamA)
        assertNull(teamAAfter!!.timecode)
    }

    @Test
    fun retractMatchAttemptIsUndoneByReactivation() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val startStation = !addTestStation(eventId, userId, TimingStationType.START)
        val finishStation = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val fixture = !createTestMatchFixture(eventId, teamCount = 1)
        val team = fixture.teamIds.single()

        val start = !addAssignedMark(eventId, userId, startStation, team, 1755430000000)
        val finish = !addAssignedMark(eventId, userId, finishStation, team, 1755430090000)
        !TimingService.retractMatchAttempt(fixture.setupMatchId, eventId, userId)

        // Die vorhandene Reaktivierung stellt beide Marken wieder her - samt Ergebnis am Lauf,
        // weil die Zuordnungen nie gelöst wurden.
        !TimingService.reactivateTimeMark(start, eventId, userId)
        !TimingService.reactivateTimeMark(finish, eventId, userId)

        assertEquals("ACTIVE", (!TimingTimeMarkRepo.get(start))!!.status)
        assertEquals("ACTIVE", (!TimingTimeMarkRepo.get(finish))!!.status)
        val official = !TimingOfficialTimeRepo.getByTeam(team)
        assertEquals(90000L, official!!.computedMillis)
        assertNotNull((!CompetitionMatchTeamRepo.getById(team))!!.timecode)
    }

    // Die Abgrenzung zum Bündel-Weg: die Einzelmarken-Korrektur (eine Startmarke in der
    // Zeitenliste zurücknehmen und neu stempeln) lässt die Zielmarken der Partie aktiv - sie ist
    // der Weg für "Start nachträglich korrigieren", nicht für "Versuch verwerfen".
    @Test
    fun singleStartRetractKeepsFinishMarksActive() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val startStation = !addTestStation(eventId, userId, TimingStationType.START)
        val finishStation = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val fixture = !createTestMatchFixture(eventId, teamCount = 1)
        val team = fixture.teamIds.single()

        val start = !addAssignedMark(eventId, userId, startStation, team, 1755430000000)
        val finish = !addAssignedMark(eventId, userId, finishStation, team, 1755430090000)

        !TimingService.retractTimeMark(start, eventId, userId)

        assertEquals("RETRACTED", (!TimingTimeMarkRepo.get(start))!!.status)
        assertEquals("ACTIVE", (!TimingTimeMarkRepo.get(finish))!!.status)
    }

    @Test
    fun retractMatchAttemptIsIdempotent() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val startStation = !addTestStation(eventId, userId, TimingStationType.START)
        val fixture = !createTestMatchFixture(eventId, teamCount = 1)
        val start = !addAssignedMark(eventId, userId, startStation, fixture.teamIds.single(), 1755430000000)

        !TimingService.retractMatchAttempt(fixture.setupMatchId, eventId, userId)
        // Zweiter Griff (Doppelklick auf den Menüpunkt): nichts mehr zurückzunehmen, kein Fehler.
        !TimingService.retractMatchAttempt(fixture.setupMatchId, eventId, userId)

        assertEquals("RETRACTED", (!TimingTimeMarkRepo.get(start))!!.status)
    }

    @Test
    fun deleteStationFailsWhenStationHasTimeMarks() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)
        !TimingService.createTimeMark(
            CreateTimeMarkRequest(UUID.randomUUID(), stationId, 1755430000000),
            userId,
            eventId,
        )

        assertKIOFails(TimingError.StationHasTimeMarks) {
            TimingService.deleteStation(stationId, eventId)
        }
    }
}
