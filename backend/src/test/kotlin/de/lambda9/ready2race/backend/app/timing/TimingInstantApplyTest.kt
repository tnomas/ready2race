package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.competitionExecution.control.CompetitionMatchTeamRepo
import de.lambda9.ready2race.backend.app.timing.boundary.TimingOfficialTimeService
import de.lambda9.ready2race.backend.app.timing.boundary.TimingService
import de.lambda9.ready2race.backend.app.timing.control.TimingOfficialTimeRepo
import de.lambda9.ready2race.backend.app.timing.entity.*
import de.lambda9.ready2race.backend.database.generated.tables.records.TimecodeRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.EVENT
import de.lambda9.ready2race.backend.database.generated.tables.references.TIMECODE
import de.lambda9.ready2race.testing.testComprehension
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.orDie
import de.lambda9.tailwind.jooq.Jooq
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Die Echtzeit-Rückschreibung als Kette: eine Mutation an Marken/Zuordnungen/Strafen schreibt das
 * Ergebnis im selben Aufruf an `competition_match_team` - ohne Rechen- oder Übernahme-Klick.
 * Der Schalter "Automatische Übernahme" hält die Berechnung am Laufen, aber die Läufe unberührt;
 * das Wiedereinschalten zieht den aufgelaufenen Stand einmalig nach.
 */
class TimingInstantApplyTest {

    private val startMillis = 1755430000000L
    private val finishMillis = startMillis + 90_000L

    private fun setAutoApply(eventId: UUID, enabled: Boolean): App<Any?, Unit> = Jooq.query {
        update(EVENT).set(EVENT.TIMING_AUTO_APPLY, enabled).where(EVENT.ID.eq(eventId)).execute()
    }.orDie().map { }

    /** Start- und Zielposten plus ein Team - noch ohne Marken. */
    private data class Track(val startStation: UUID, val finishStation: UUID, val teamId: UUID)

    private fun prepareTrack(eventId: UUID, userId: UUID): App<Any?, Track> = KIO.comprehension {
        val startStation = !addTestStation(eventId, userId, TimingStationType.START)
        val finishStation = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val teamId = !createTestMatchTeam(eventId)
        KIO.ok(Track(startStation, finishStation, teamId))
    }

    // ---------------------------------------------------------------- Zuordnung -> Ergebnis

    @Test
    fun assigningStartAndFinishWritesTheResultInstantly() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val track = !prepareTrack(eventId, userId)
        !addAssignedMark(eventId, userId, track.startStation, track.teamId, startMillis)
        !addAssignedMark(eventId, userId, track.finishStation, track.teamId, finishMillis)

        // Kein compute, kein push - die Zuordnung selbst hat geschrieben.
        val team = !CompetitionMatchTeamRepo.getById(track.teamId)
        assertEquals(track.teamId, team!!.timecode)
        val timecode = !Jooq.query { selectFrom(TIMECODE).where(TIMECODE.ID.eq(track.teamId)).fetchOne() }
        assertEquals(90_000L, timecode!!.time)

        val official = !TimingOfficialTimeRepo.getByTeam(track.teamId)
        assertEquals(90_000L, official!!.computedMillis)
        assertFalse(official.dirty!!)
        assertNotNull(official.pushedAt)
        assertNotNull(official.appliedFingerprint)
    }

    // Zielzeit VOR dem Start (Zielposten erfasst eine Partie ohne Startmarke): der
    // NO_START_MARK-Pfad bleibt sauber - nichts am Lauf, kein Fehler, kein dirty-Müll. Wird der
    // Start nachgetragen, rechnet die Übernahme von selbst und das Ergebnis erscheint ohne
    // weiteren Eingriff - genau der Sinn des "Zielzeiten ohne Start"-Wegs am Board.
    @Test
    fun finishBeforeStartStaysCleanAndAppliesOnceStartArrives() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val track = !prepareTrack(eventId, userId)

        !addAssignedMark(eventId, userId, track.finishStation, track.teamId, finishMillis)

        // Ohne Start kein Rechenergebnis: nichts am Team, keine dirty-Zeile.
        val teamBefore = !CompetitionMatchTeamRepo.getById(track.teamId)
        assertNull(teamBefore!!.timecode)
        assertFalse(teamBefore.failed == true)
        val officialBefore = !TimingOfficialTimeRepo.getByTeam(track.teamId)
        if (officialBefore != null) {
            assertNull(officialBefore.computedMillis)
            assertFalse(officialBefore.dirty!!)
        }

        // Start nachstempeln: die offizielle Zeit erscheint ohne weiteren Eingriff.
        !addAssignedMark(eventId, userId, track.startStation, track.teamId, startMillis)

        val teamAfter = !CompetitionMatchTeamRepo.getById(track.teamId)
        assertEquals(track.teamId, teamAfter!!.timecode)
        val timecode = !Jooq.query { selectFrom(TIMECODE).where(TIMECODE.ID.eq(track.teamId)).fetchOne() }
        assertEquals(90_000L, timecode!!.time)
        val officialAfter = !TimingOfficialTimeRepo.getByTeam(track.teamId)
        assertEquals(90_000L, officialAfter!!.computedMillis)
        assertFalse(officialAfter.dirty!!)
    }

    // Die Rückschreibung endet am Ergebnis: Plätze, finished_at und die Rundenkette bleiben
    // unberührt - beendet wird ein Lauf weiterhin nur dort, wo er heute beendet wird.
    @Test
    fun instantApplyNeverTouchesPlacesOrMatchEnd() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val track = !prepareTrack(eventId, userId)
        !addAssignedMark(eventId, userId, track.startStation, track.teamId, startMillis)
        !addAssignedMark(eventId, userId, track.finishStation, track.teamId, finishMillis)

        val team = !CompetitionMatchTeamRepo.getById(track.teamId)
        assertNull(team!!.place)
        assertFalse(team.placesCalculated!!)
        val match = !Jooq.query {
            selectFrom(de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_MATCH)
                .where(
                    de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_MATCH
                        .COMPETITION_SETUP_MATCH.eq(team.competitionMatch)
                )
                .fetchOne()
        }
        assertNull(match!!.finishedAt)
    }

    @Test
    fun reassigningTheFinishMovesTheResultBetweenTeams() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val startStation = !addTestStation(eventId, userId, TimingStationType.START)
        val finishStation = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val teams = !createTestMatchTeams(eventId, 2)
        !addAssignedMark(eventId, userId, startStation, teams[0], startMillis)
        !addAssignedMark(eventId, userId, startStation, teams[1], startMillis)
        val finishMark = !addAssignedMark(eventId, userId, finishStation, teams[0], finishMillis)
        assertEquals(teams[0], (!CompetitionMatchTeamRepo.getById(teams[0]))!!.timecode)

        !TimingService.assignTimeMark(AssignTimeMarkRequest(teams[1]), userId, finishMark, eventId)

        // Beide Seiten des Umhängens sind sofort nachgezogen: das alte Team verliert sein
        // Ergebnis, das neue bekommt es.
        assertNull((!CompetitionMatchTeamRepo.getById(teams[0]))!!.timecode)
        assertEquals(teams[1], (!CompetitionMatchTeamRepo.getById(teams[1]))!!.timecode)
    }

    // ---------------------------------------------------------------- Rücknahme & Reaktivierung

    @Test
    fun retractingTheFinishClearsTheResult() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val track = !prepareTrack(eventId, userId)
        !addAssignedMark(eventId, userId, track.startStation, track.teamId, startMillis)
        val finishMark = !addAssignedMark(eventId, userId, track.finishStation, track.teamId, finishMillis)

        !TimingService.retractTimeMark(finishMark, eventId, userId)

        val team = !CompetitionMatchTeamRepo.getById(track.teamId)
        assertNull(team!!.timecode)
        assertFalse(team.failed!!)
        assertEquals(0, (!Jooq.query { selectFrom(TIMECODE).fetch() }).size)

        val official = !TimingOfficialTimeRepo.getByTeam(track.teamId)
        assertNull(official!!.computedMillis)
        assertNull(official.appliedFingerprint)
        assertFalse(official.dirty!!)
    }

    @Test
    fun reactivatingTheFinishRestoresTheResultWithItsAssignment() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val track = !prepareTrack(eventId, userId)
        !addAssignedMark(eventId, userId, track.startStation, track.teamId, startMillis)
        val finishMark = !addAssignedMark(eventId, userId, track.finishStation, track.teamId, finishMillis)
        !TimingService.retractTimeMark(finishMark, eventId, userId)

        !TimingService.reactivateTimeMark(finishMark, eventId, userId)

        val mark = !de.lambda9.ready2race.backend.app.timing.control.TimingTimeMarkRepo.get(finishMark)
        assertEquals("ACTIVE", mark!!.status)
        // Audit-Spur wie bei der Rücknahme: wer reaktiviert hat, steht am Datensatz.
        assertEquals(userId, mark.updatedBy)
        // Die frühere Zuordnung ist erhalten geblieben und die Zeit steht wieder am Lauf.
        assertEquals(track.teamId, (!CompetitionMatchTeamRepo.getById(track.teamId))!!.timecode)
        val timecode = !Jooq.query { selectFrom(TIMECODE).where(TIMECODE.ID.eq(track.teamId)).fetchOne() }
        assertEquals(90_000L, timecode!!.time)
    }

    @Test
    fun reactivatingAnActiveMarkIsANoop() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val track = !prepareTrack(eventId, userId)
        val mark = !addAssignedMark(eventId, userId, track.finishStation, track.teamId, finishMillis)

        !TimingService.reactivateTimeMark(mark, eventId, userId)

        assertEquals("ACTIVE", (!de.lambda9.ready2race.backend.app.timing.control.TimingTimeMarkRepo.get(mark))!!.status)
    }

    @Test
    fun reactivatingFailsForMarkOfDifferentEvent() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val (otherEventId, otherUserId) = !createTestEventWithAdmin()
        val otherTrack = !prepareTrack(otherEventId, otherUserId)
        val otherMark = !addAssignedMark(otherEventId, otherUserId, otherTrack.finishStation, otherTrack.teamId, finishMillis)

        assertKIOFails(TimingError.EventMismatch) {
            TimingService.reactivateTimeMark(otherMark, eventId, userId)
        }
    }

    // ---------------------------------------------------------------- Schalter

    @Test
    fun switchOffComputesButWritesNothing() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !setAutoApply(eventId, false)
        val track = !prepareTrack(eventId, userId)
        !addAssignedMark(eventId, userId, track.startStation, track.teamId, startMillis)
        !addAssignedMark(eventId, userId, track.finishStation, track.teamId, finishMillis)

        // Die Berechnung läuft weiter ...
        val official = !TimingOfficialTimeRepo.getByTeam(track.teamId)
        assertEquals(90_000L, official!!.computedMillis)
        // ... aber am Lauf steht nichts, und die Zeile zeigt den ausstehenden Stand an.
        assertNull((!CompetitionMatchTeamRepo.getById(track.teamId))!!.timecode)
        assertTrue(official.dirty!!)
        assertNull(official.appliedFingerprint)
    }

    @Test
    fun enablingTheSwitchCatchesUpOnce() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !setAutoApply(eventId, false)
        val track = !prepareTrack(eventId, userId)
        !addAssignedMark(eventId, userId, track.startStation, track.teamId, startMillis)
        !addAssignedMark(eventId, userId, track.finishStation, track.teamId, finishMillis)
        assertNull((!CompetitionMatchTeamRepo.getById(track.teamId))!!.timecode)

        !TimingOfficialTimeService.setAutoApply(eventId, TimingAutoApplyRequest(enabled = true), userId)

        val team = !CompetitionMatchTeamRepo.getById(track.teamId)
        assertEquals(track.teamId, team!!.timecode)
        val official = !TimingOfficialTimeRepo.getByTeam(track.teamId)
        assertFalse(official!!.dirty!!)
        assertNotNull(official.appliedFingerprint)
    }

    @Test
    fun disablingTheSwitchDoesNotTouchExistingResults() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val track = !prepareTrack(eventId, userId)
        !addAssignedMark(eventId, userId, track.startStation, track.teamId, startMillis)
        !addAssignedMark(eventId, userId, track.finishStation, track.teamId, finishMillis)
        assertEquals(track.teamId, (!CompetitionMatchTeamRepo.getById(track.teamId))!!.timecode)

        !TimingOfficialTimeService.setAutoApply(eventId, TimingAutoApplyRequest(enabled = false), userId)

        // Ausschalten hält nur künftige Schreibvorgänge an - geschriebene Ergebnisse bleiben.
        assertEquals(track.teamId, (!CompetitionMatchTeamRepo.getById(track.teamId))!!.timecode)
        assertFalse((!Jooq.query { selectFrom(EVENT).where(EVENT.ID.eq(eventId)).fetchOne() })!!.timingAutoApply!!)
    }

    // ---------------------------------------------------------------- Strafen mit Grund

    @Test
    fun penaltyWithReasonReachesTheTeam() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val track = !prepareTrack(eventId, userId)
        !addAssignedMark(eventId, userId, track.startStation, track.teamId, startMillis)
        !addAssignedMark(eventId, userId, track.finishStation, track.teamId, finishMillis)

        !TimingOfficialTimeService.setOverride(
            eventId,
            track.teamId,
            OfficialTimeOverrideRequest(
                overrideMillis = null,
                penaltyMillis = 5_000,
                penaltyNote = "Frühstart",
                resultStatus = null,
            ),
            userId,
        )

        val team = !CompetitionMatchTeamRepo.getById(track.teamId)
        assertEquals(5, team!!.penaltySeconds)
        assertEquals("Frühstart", team.penaltyNote)
        // Die geschriebene Zeit enthält die Strafe bereits - dieselbe Konvention wie bisher.
        val timecode = !Jooq.query { selectFrom(TIMECODE).where(TIMECODE.ID.eq(track.teamId)).fetchOne() }
        assertEquals(95_000L, timecode!!.time)

        val dto = (!TimingOfficialTimeService.getForEvent(eventId)).data.single()
        assertEquals("Frühstart", dto.penaltyNote)
    }

    @Test
    fun removingThePenaltyAlsoRemovesReasonAndSeconds() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val track = !prepareTrack(eventId, userId)
        !addAssignedMark(eventId, userId, track.startStation, track.teamId, startMillis)
        !addAssignedMark(eventId, userId, track.finishStation, track.teamId, finishMillis)
        !TimingOfficialTimeService.setOverride(
            eventId,
            track.teamId,
            OfficialTimeOverrideRequest(null, 5_000, "Frühstart", null),
            userId,
        )

        !TimingOfficialTimeService.setOverride(
            eventId,
            track.teamId,
            OfficialTimeOverrideRequest(null, null, null, null),
            userId,
        )

        val team = !CompetitionMatchTeamRepo.getById(track.teamId)
        assertNull(team!!.penaltySeconds)
        assertNull(team.penaltyNote)
        val timecode = !Jooq.query { selectFrom(TIMECODE).where(TIMECODE.ID.eq(track.teamId)).fetchOne() }
        assertEquals(90_000L, timecode!!.time)
    }

    // ---------------------------------------------------------------- Fremde Stände

    @Test
    fun neverOverwritesAForeignResult() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val track = !prepareTrack(eventId, userId)
        // Ein importiertes/handeingetragenes Ergebnis, das nicht von der Zeitnahme stammt.
        val foreignTimecode = UUID.randomUUID()
        !Jooq.query {
            insertInto(TIMECODE)
                .set(TimecodeRecord(id = foreignTimecode, time = 88_000L, baseUnit = "MINUTES", millisecondPrecision = "THREE"))
                .execute()
        }
        !CompetitionMatchTeamRepo.updateById(track.teamId) { timecode = foreignTimecode }.orDie()

        !addAssignedMark(eventId, userId, track.startStation, track.teamId, startMillis)
        !addAssignedMark(eventId, userId, track.finishStation, track.teamId, finishMillis)

        // Das fremde Ergebnis steht unverändert, die Zeitnahme zeigt die Abweichung als dirty.
        assertEquals(foreignTimecode, (!CompetitionMatchTeamRepo.getById(track.teamId))!!.timecode)
        val official = !TimingOfficialTimeRepo.getByTeam(track.teamId)
        assertEquals(90_000L, official!!.computedMillis)
        assertTrue(official.dirty!!)
    }

    @Test
    fun calculatedPlacesFreezeLaterChanges() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val track = !prepareTrack(eventId, userId)
        !addAssignedMark(eventId, userId, track.startStation, track.teamId, startMillis)
        val finishMark = !addAssignedMark(eventId, userId, track.finishStation, track.teamId, finishMillis)
        !CompetitionMatchTeamRepo.updateById(track.teamId) { placesCalculated = true }.orDie()

        !TimingService.retractTimeMark(finishMark, eventId, userId)

        // Das Ergebnis mit berechneten Plätzen bleibt stehen; die Zeile zeigt die Abweichung.
        assertEquals(track.teamId, (!CompetitionMatchTeamRepo.getById(track.teamId))!!.timecode)
        val official = !TimingOfficialTimeRepo.getByTeam(track.teamId)
        assertNull(official!!.computedMillis)
        assertTrue(official.dirty!!)
    }

    // Ein von der Automatik geschriebenes DNF friert die eigene Korrektur nicht ein - der manuelle
    // Übernahme-Weg muss danach genauso weiterarbeiten können wie die Automatik selbst.
    @Test
    fun ownDnfCanBeCorrectedBack() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val track = !prepareTrack(eventId, userId)
        !addAssignedMark(eventId, userId, track.startStation, track.teamId, startMillis)
        !addAssignedMark(eventId, userId, track.finishStation, track.teamId, finishMillis)
        !TimingOfficialTimeService.setOverride(
            eventId,
            track.teamId,
            OfficialTimeOverrideRequest(null, null, null, OfficialTimeResultStatus.DNF),
            userId,
        )
        val afterDnf = !CompetitionMatchTeamRepo.getById(track.teamId)
        assertTrue(afterDnf!!.failed!!)
        assertNull(afterDnf.timecode)

        !TimingOfficialTimeService.setOverride(
            eventId,
            track.teamId,
            OfficialTimeOverrideRequest(null, null, null, OfficialTimeResultStatus.NONE),
            userId,
        )

        val team = !CompetitionMatchTeamRepo.getById(track.teamId)
        assertFalse(team!!.failed!!)
        assertEquals(track.teamId, team.timecode)
    }

    // ---------------------------------------------------------------- Idempotenz & Stand-Meldung

    @Test
    fun reapplyingAnUnchangedStateWritesNothingButReportsTheState() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val track = !prepareTrack(eventId, userId)
        !addAssignedMark(eventId, userId, track.startStation, track.teamId, startMillis)
        !addAssignedMark(eventId, userId, track.finishStation, track.teamId, finishMillis)
        val before = !CompetitionMatchTeamRepo.getById(track.teamId)

        val changed = !TimingOfficialTimeService.recomputeAndApply(eventId, listOf(track.teamId), userId)

        // Der Rückgabewert meldet den aktuellen Stand des Teams (die Boards folgen jeder
        // Mutation live), auch wenn nichts zu schreiben war ...
        assertEquals(90_000L, changed.single().computedMillis)
        // ... geschrieben wird dabei aber nichts: Zeile und Team bleiben unangetastet.
        val after = !CompetitionMatchTeamRepo.getById(track.teamId)
        assertEquals(before!!.updatedAt, after!!.updatedAt)
    }

    // Zielzeit ohne Start: es entsteht keine Zeile und nichts wird geschrieben — aber der Aufruf
    // meldet den Stand als Platzhalter (wie getForEvent), sonst erfahren Leitstand und Boards
    // erst nach einem Neuladen, DASS ein Ziel ohne Start dasteht, und können den Grund
    // („kein Start") nicht anzeigen.
    @Test
    fun finishWithoutStartReportsThePlaceholderState() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val track = !prepareTrack(eventId, userId)
        !addAssignedMark(eventId, userId, track.finishStation, track.teamId, finishMillis)

        val changed = !TimingOfficialTimeService.recomputeAndApply(eventId, listOf(track.teamId), userId)

        val dto = changed.single()
        assertEquals(track.teamId, dto.competitionMatchTeam)
        assertEquals(finishMillis, dto.finishMillis)
        assertNull(dto.startMillis)
        assertNull(dto.computedMillis)
        assertNull(dto.effectiveMillis)
        // Platzhalter heißt: weiterhin keine persistierte Zeile.
        assertNull(!TimingOfficialTimeRepo.getByTeam(track.teamId))
    }

    // Ein Team ganz ohne Marken und ohne Zeile hat nichts zu melden — kein Platzhalter-Rauschen
    // für Boote, die schlicht noch nicht dran waren.
    @Test
    fun teamWithoutMarksAndRowStaysSilent() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val track = !prepareTrack(eventId, userId)

        val changed = !TimingOfficialTimeService.recomputeAndApply(eventId, listOf(track.teamId), userId)

        assertEquals(emptyList(), changed)
    }
}
