package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.competitionExecution.control.CompetitionMatchTeamRepo
import de.lambda9.ready2race.backend.app.timing.boundary.TimingOfficialTimeService
import de.lambda9.ready2race.backend.app.timing.boundary.TimingService
import de.lambda9.ready2race.backend.app.timing.control.TimingOfficialTimeRepo
import de.lambda9.ready2race.backend.app.timing.control.TimingTimeMarkRepo
import de.lambda9.ready2race.backend.app.timing.entity.*
import de.lambda9.ready2race.backend.app.timingConfig.entity.TimingSystem
import de.lambda9.ready2race.backend.data.Timecode
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_MATCH
import de.lambda9.ready2race.backend.database.generated.tables.references.EVENT
import de.lambda9.ready2race.backend.database.generated.tables.references.TIMECODE
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.orDie
import de.lambda9.tailwind.jooq.Jooq
import de.lambda9.ready2race.testing.testComprehension
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The official-time layer: computing times from assigned marks, the manual override arithmetic,
 * dirty tracking, and the push into the existing `timecode` results flow.
 */
class TimingOfficialTimeServiceTest {

    private val startMillis = START_MILLIS
    private val finishMillis = START_MILLIS + 90_000L

    // ---------------------------------------------------------------- compute

    @Test
    fun computeUsesAssignedStartAndFinishMarks() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val startStation = !addTestStation(eventId, userId, TimingStationType.START)
        val finishStation = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val teamId = !createTestMatchTeam(eventId)
        !addAssignedMark(eventId, userId, startStation, teamId, startMillis)
        !addAssignedMark(eventId, userId, finishStation, teamId, finishMillis)

        val result = (!TimingOfficialTimeService.computeOfficialTimes(eventId, userId)).dto

        assertEquals(emptyList(), result.skipped)
        val computed = result.computed.single()
        assertEquals(teamId, computed.competitionMatchTeam)
        assertEquals(90_000L, computed.computedMillis)
        assertEquals(90_000L, computed.effectiveMillis)
        assertEquals(startMillis, computed.startMillis)
        assertEquals(finishMillis, computed.finishMillis)
        assertFalse(computed.dirty)
        // Echtzeit-Übernahme: die Zuordnung der Marken hat bereits geschrieben, der Rechen-Endpunkt
        // findet den Stand angewendet vor.
        assertNotNull(computed.pushedAt)

        val record = !TimingOfficialTimeRepo.getByTeam(teamId)
        assertNotNull(record)
        assertEquals(90_000L, record.computedMillis)
        assertEquals(0L, record.penaltyMillis)
        assertEquals(OfficialTimeResultStatus.NONE.name, record.resultStatus)
    }

    @Test
    fun computeSkipsTeamWithFinishButNoStart() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val finishStation = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val teamId = !createTestMatchTeam(eventId)
        !addAssignedMark(eventId, userId, finishStation, teamId, finishMillis)

        val result = (!TimingOfficialTimeService.computeOfficialTimes(eventId, userId)).dto

        assertEquals(emptyList(), result.computed)
        assertEquals(
            listOf(OfficialTimeSkipDto(teamId, OfficialTimeSkipReason.NO_START_MARK)),
            result.skipped,
        )
        assertNull(!TimingOfficialTimeRepo.getByTeam(teamId))
    }

    @Test
    fun computeSkipsTeamWithStartButNoFinish() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val startStation = !addTestStation(eventId, userId, TimingStationType.START)
        val teamId = !createTestMatchTeam(eventId)
        !addAssignedMark(eventId, userId, startStation, teamId, startMillis)

        val result = (!TimingOfficialTimeService.computeOfficialTimes(eventId, userId)).dto

        assertEquals(
            listOf(OfficialTimeSkipDto(teamId, OfficialTimeSkipReason.NO_FINISH_MARK)),
            result.skipped,
        )
    }

    @Test
    fun computeSkipsNegativeDuration() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val startStation = !addTestStation(eventId, userId, TimingStationType.START)
        val finishStation = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val teamId = !createTestMatchTeam(eventId)
        !addAssignedMark(eventId, userId, startStation, teamId, finishMillis)
        !addAssignedMark(eventId, userId, finishStation, teamId, startMillis)

        val result = (!TimingOfficialTimeService.computeOfficialTimes(eventId, userId)).dto

        assertEquals(emptyList(), result.computed)
        assertEquals(
            listOf(OfficialTimeSkipDto(teamId, OfficialTimeSkipReason.NEGATIVE_DURATION)),
            result.skipped,
        )
    }

    @Test
    fun computeIgnoresRetractedMarks() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val startStation = !addTestStation(eventId, userId, TimingStationType.START)
        val finishStation = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val teamId = !createTestMatchTeam(eventId)
        !addAssignedMark(eventId, userId, startStation, teamId, startMillis)
        val finishMarkId = !addAssignedMark(eventId, userId, finishStation, teamId, finishMillis)
        !TimingService.retractTimeMark(finishMarkId, eventId, userId)

        val result = (!TimingOfficialTimeService.computeOfficialTimes(eventId, userId)).dto

        assertEquals(
            listOf(OfficialTimeSkipDto(teamId, OfficialTimeSkipReason.NO_FINISH_MARK)),
            result.skipped,
        )
    }

    // A team that was restarted has two start marks; the later one is the start it actually took.
    // A double-tapped finish is the mirror case: the first crossing is the real one.
    @Test
    fun computeUsesLatestStartAndEarliestFinish() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val startStation = !addTestStation(eventId, userId, TimingStationType.START)
        val finishStation = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val teamId = !createTestMatchTeam(eventId)
        !addAssignedMark(eventId, userId, startStation, teamId, startMillis)
        !addAssignedMark(eventId, userId, startStation, teamId, startMillis + 10_000)
        !addAssignedMark(eventId, userId, finishStation, teamId, finishMillis)
        !addAssignedMark(eventId, userId, finishStation, teamId, finishMillis + 5_000)

        val result = (!TimingOfficialTimeService.computeOfficialTimes(eventId, userId)).dto

        assertEquals(80_000L, result.computed.single().computedMillis)
    }

    // Eine Neuberechnung erneuert nur den Maschinenwert; Override, Strafe und Status bleiben - und
    // die Echtzeit-Übernahme hält den Lauf dabei durchgehend auf dem effektiven Stand (dirty=false).
    @Test
    fun computeKeepsOverridesAcrossTimingEdits() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val startStation = !addTestStation(eventId, userId, TimingStationType.START)
        val finishStation = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val teamId = !createTestMatchTeam(eventId)
        !addAssignedMark(eventId, userId, startStation, teamId, startMillis)
        val finishMarkId = !addAssignedMark(eventId, userId, finishStation, teamId, finishMillis)
        !TimingOfficialTimeService.setOverride(
            eventId,
            teamId,
            OfficialTimeOverrideRequest(overrideMillis = 85_000, penaltyMillis = 2_000, resultStatus = null),
            userId,
        )
        // Die Rücknahme rechnet sofort nach: der Maschinenwert fällt weg, der Override trägt weiter.
        !TimingService.retractTimeMark(finishMarkId, eventId, userId)
        val afterRetract = !TimingOfficialTimeRepo.getByTeam(teamId)
        assertNull(afterRetract!!.computedMillis)
        assertEquals(85_000L, afterRetract.overrideMillis)
        assertFalse(afterRetract.dirty!!)

        !addAssignedMark(eventId, userId, finishStation, teamId, finishMillis + 1_000)
        val result = (!TimingOfficialTimeService.computeOfficialTimes(eventId, userId)).dto

        val computed = result.computed.single()
        assertEquals(91_000L, computed.computedMillis)
        assertEquals(85_000L, computed.overrideMillis)
        assertEquals(2_000L, computed.penaltyMillis)
        assertEquals(87_000L, computed.effectiveMillis)
        assertFalse(computed.dirty)
    }

    @Test
    fun computeReportsNoMarksForExplicitTeamWithoutAnyMarks() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val teamId = !createTestMatchTeam(eventId)

        val result = (!TimingOfficialTimeService.computeOfficialTimes(eventId, userId, listOf(teamId))).dto

        assertEquals(emptyList(), result.computed)
        assertEquals(
            listOf(OfficialTimeSkipDto(teamId, OfficialTimeSkipReason.NO_MARKS)),
            result.skipped,
        )
        // No row is created for a team that could not be computed at all.
        assertNull(!TimingOfficialTimeRepo.getByTeam(teamId))
    }

    @Test
    fun computeCanBeScopedToTeams() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val startStation = !addTestStation(eventId, userId, TimingStationType.START)
        val finishStation = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val teams = !createTestMatchTeams(eventId, 2)
        teams.forEach { teamId ->
            !addAssignedMark(eventId, userId, startStation, teamId, startMillis)
            !addAssignedMark(eventId, userId, finishStation, teamId, finishMillis)
        }

        val result = (!TimingOfficialTimeService.computeOfficialTimes(eventId, userId, listOf(teams[0]))).dto

        // Die Antwort bleibt auf die angefragten Teams beschränkt. (Eine Zeile für teams[1]
        // existiert längst - die Echtzeit-Übernahme hat sie beim Zuordnen der Marken angelegt.)
        assertEquals(listOf(teams[0]), result.computed.map { it.competitionMatchTeam })
        assertEquals(90_000L, (!TimingOfficialTimeRepo.getByTeam(teams[1]))!!.computedMillis)
    }

    // ------------------------------------------------------- override / status

    @Test
    fun resultStatusSupersedesAnyTime() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val startStation = !addTestStation(eventId, userId, TimingStationType.START)
        val finishStation = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val teamId = !createTestMatchTeam(eventId)
        !addAssignedMark(eventId, userId, startStation, teamId, startMillis)
        !addAssignedMark(eventId, userId, finishStation, teamId, finishMillis)
        !TimingOfficialTimeService.computeOfficialTimes(eventId, userId)

        !TimingOfficialTimeService.setOverride(
            eventId,
            teamId,
            OfficialTimeOverrideRequest(null, null, null, OfficialTimeResultStatus.DSQ),
            userId,
        )

        val dto = (!TimingOfficialTimeService.getForEvent(eventId)).data.single()
        assertEquals(OfficialTimeResultStatus.DSQ, dto.resultStatus)
        assertEquals(90_000L, dto.computedMillis)
        assertNull(dto.effectiveMillis)
    }

    @Test
    fun overrideCreatesRowForTeamWithoutMarks() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val teamId = !createTestMatchTeam(eventId)

        !TimingOfficialTimeService.setOverride(
            eventId,
            teamId,
            OfficialTimeOverrideRequest(overrideMillis = 61_500, penaltyMillis = null, resultStatus = null),
            userId,
        )

        val dto = (!TimingOfficialTimeService.getForEvent(eventId)).data.single()
        assertEquals(61_500L, dto.overrideMillis)
        assertEquals(61_500L, dto.effectiveMillis)
        assertNull(dto.computedMillis)
        assertEquals(0L, dto.penaltyMillis)
    }

    @Test
    fun overrideFailsForTeamOfDifferentEvent() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val (otherEventId, _) = !createTestEventWithAdmin()
        val teamId = !createTestMatchTeam(otherEventId)

        assertKIOFails(TimingError.EventMismatch) {
            TimingOfficialTimeService.setOverride(
                eventId,
                teamId,
                OfficialTimeOverrideRequest(1000, null, null, null),
                userId,
            )
        }
    }

    // -------------------------------------------------------------- dirty-Kennzeichen

    // Mit eingeschalteter Echtzeit-Übernahme wird nichts mehr "dirty": jede Mutation zieht sofort
    // nach. Das Kennzeichen lebt dort weiter, wo das Nachziehen unterbleibt - etwa bei
    // ausgeschaltetem Schalter, nachdem vorher schon geschrieben wurde.
    @Test
    fun retractingWithSwitchOffMarksTheAppliedRowDirty() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val startStation = !addTestStation(eventId, userId, TimingStationType.START)
        val finishStation = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val teamId = !createTestMatchTeam(eventId)
        !addAssignedMark(eventId, userId, startStation, teamId, startMillis)
        val finishMarkId = !addAssignedMark(eventId, userId, finishStation, teamId, finishMillis)
        // Echtzeit-Übernahme hat geschrieben und alles ist sauber ...
        assertFalse((!TimingOfficialTimeRepo.getByTeam(teamId))!!.dirty!!)

        // ... dann wird der Schalter ausgestellt und die Grundlage der Zeit zurückgenommen.
        !Jooq.query {
            update(EVENT).set(EVENT.TIMING_AUTO_APPLY, false).where(EVENT.ID.eq(eventId)).execute()
        }
        !TimingService.retractTimeMark(finishMarkId, eventId, userId)

        // Der Lauf trägt noch die alte Zeit, die Zeile weiß, dass sie nicht mehr stimmt.
        assertTrue((!TimingOfficialTimeRepo.getByTeam(teamId))!!.dirty!!)
        assertEquals(teamId, (!CompetitionMatchTeamRepo.getById(teamId))!!.timecode)
    }

    @Test
    fun timingEditWithoutOfficialTimeIsANoop() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val finishStation = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val teamId = !createTestMatchTeam(eventId)
        val markId = !addAssignedMark(eventId, userId, finishStation, teamId, finishMillis)

        !TimingService.retractTimeMark(markId, eventId, userId)

        assertNull(!TimingOfficialTimeRepo.getByTeam(teamId))
    }

    // --------------------------------------------------------------- push

    @Test
    fun pushWritesTimecodeLikeTheImportPath() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val teamId = !pushablePreparedTeam(eventId, userId)

        !TimingOfficialTimeService.pushOfficialTimes(
            eventId,
            PushOfficialTimesRequest(listOf(teamId), force = false),
            userId,
        )

        val team = !CompetitionMatchTeamRepo.getById(teamId)
        assertNotNull(team)
        // Exactly what CompetitionExecutionService.updateMatchResult(-ByFile) writes: the timecode
        // row carries the match team's own id, the millis of the time, and the base unit /
        // millisecond precision Parser.timecode derives for that value.
        assertEquals(teamId, team.timecode)
        val timecode = !Jooq.query { selectFrom(TIMECODE).where(TIMECODE.ID.eq(teamId)).fetchOne() }
        assertNotNull(timecode)
        assertEquals(90_000L, timecode.time)
        assertEquals(Timecode.BaseUnit.MINUTES.name, timecode.baseUnit)
        assertEquals(Timecode.MillisecondPrecision.THREE.name, timecode.millisecondPrecision)
        // The push never touches places or the failed state of a finisher.
        assertFalse(team.failed!!)
        assertNull(team.failedReason)
        assertNull(team.place)
        assertFalse(team.placesCalculated!!)

        val official = !TimingOfficialTimeRepo.getByTeam(teamId)
        assertNotNull(official!!.pushedAt)
        assertFalse(official.dirty!!)
    }

    @Test
    fun pushUsesSecondsBaseUnitBelowAMinute() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val teamId = !pushablePreparedTeam(eventId, userId, durationMillis = 42_100)

        !TimingOfficialTimeService.pushOfficialTimes(eventId, PushOfficialTimesRequest(listOf(teamId)), userId)

        val timecode = !Jooq.query { selectFrom(TIMECODE).where(TIMECODE.ID.eq(teamId)).fetchOne() }
        assertEquals(42_100L, timecode!!.time)
        assertEquals(Timecode.BaseUnit.SECONDS.name, timecode.baseUnit)
    }

    @Test
    fun pushWritesEffectiveTimeIncludingPenalty() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val teamId = !pushablePreparedTeam(eventId, userId)
        !TimingOfficialTimeService.setOverride(
            eventId,
            teamId,
            OfficialTimeOverrideRequest(overrideMillis = 80_000, penaltyMillis = 5_000, resultStatus = null),
            userId,
        )

        !TimingOfficialTimeService.pushOfficialTimes(eventId, PushOfficialTimesRequest(listOf(teamId)), userId)

        val timecode = !Jooq.query { selectFrom(TIMECODE).where(TIMECODE.ID.eq(teamId)).fetchOne() }
        assertEquals(85_000L, timecode!!.time)
    }

    @Test
    fun pushIsIdempotentAndReplacesAnExistingTimecode() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val teamId = !pushablePreparedTeam(eventId, userId)
        !TimingOfficialTimeService.pushOfficialTimes(eventId, PushOfficialTimesRequest(listOf(teamId)), userId)

        !TimingOfficialTimeService.setOverride(
            eventId,
            teamId,
            OfficialTimeOverrideRequest(overrideMillis = 70_000, penaltyMillis = null, resultStatus = null),
            userId,
        )
        !TimingOfficialTimeService.pushOfficialTimes(eventId, PushOfficialTimesRequest(listOf(teamId)), userId)

        val timecodes = !Jooq.query { selectFrom(TIMECODE).fetch() }
        assertEquals(1, timecodes.size)
        assertEquals(70_000L, timecodes.first().time)
        assertEquals(teamId, (!CompetitionMatchTeamRepo.getById(teamId))!!.timecode)
    }

    // DNS/DNF/DSQ mirror the import's no-result handling: no timecode at all, the status text in
    // failed_reason, and the team flagged failed.
    @Test
    fun pushOfNonFinisherWritesFailedInsteadOfTimecode() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val teamId = !pushablePreparedTeam(eventId, userId)
        !TimingOfficialTimeService.pushOfficialTimes(eventId, PushOfficialTimesRequest(listOf(teamId)), userId)
        !TimingOfficialTimeService.setOverride(
            eventId,
            teamId,
            OfficialTimeOverrideRequest(null, null, null, OfficialTimeResultStatus.DNF),
            userId,
        )

        !TimingOfficialTimeService.pushOfficialTimes(eventId, PushOfficialTimesRequest(listOf(teamId)), userId)

        val team = !CompetitionMatchTeamRepo.getById(teamId)
        assertNull(team!!.timecode)
        assertTrue(team.failed!!)
        assertEquals("DNF", team.failedReason)
        assertEquals(0, (!Jooq.query { selectFrom(TIMECODE).fetch() }).size)
        assertNotNull((!TimingOfficialTimeRepo.getByTeam(teamId))!!.pushedAt)
    }

    @Test
    fun pushFailsWhenPlacesAreCalculated() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        // Schalter aus: der reine Push-Pfad soll hier isoliert beobachtet werden - mit
        // Echtzeit-Übernahme stünde die Zeit schon vor dem Push am Lauf.
        !disableAutoApply(eventId)
        val teamId = !pushablePreparedTeam(eventId, userId)
        !CompetitionMatchTeamRepo.updateById(teamId) { placesCalculated = true }

        assertKIOFails(
            TimingError.PushConflict(listOf(OfficialTimePushConflictDto(teamId, PushConflictReason.RESULT_FROZEN)))
        ) {
            TimingOfficialTimeService.pushOfficialTimes(eventId, PushOfficialTimesRequest(listOf(teamId)), userId)
        }
        assertNull((!CompetitionMatchTeamRepo.getById(teamId))!!.timecode)
    }

    @Test
    fun pushFailsWhenTeamAlreadyHasAPlace() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val teamId = !pushablePreparedTeam(eventId, userId)
        !CompetitionMatchTeamRepo.updateById(teamId) { place = 1 }

        assertKIOFails(
            TimingError.PushConflict(listOf(OfficialTimePushConflictDto(teamId, PushConflictReason.RESULT_FROZEN)))
        ) {
            TimingOfficialTimeService.pushOfficialTimes(eventId, PushOfficialTimesRequest(listOf(teamId)), userId)
        }
    }

    // A referee can record a DNF/DNS/DSQ without ever calculating places (place stays null,
    // placesCalculated stays false) - `failed` alone is just as much a worked-on result and must
    // freeze the push the same way.
    @Test
    fun pushFailsWhenTeamWasFailedByReferee() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !disableAutoApply(eventId)
        val teamId = !pushablePreparedTeam(eventId, userId)
        !CompetitionMatchTeamRepo.updateById(teamId) { failed = true; failedReason = "DNF" }

        assertKIOFails(
            TimingError.PushConflict(listOf(OfficialTimePushConflictDto(teamId, PushConflictReason.RESULT_FROZEN)))
        ) {
            TimingOfficialTimeService.pushOfficialTimes(eventId, PushOfficialTimesRequest(listOf(teamId)), userId)
        }
        assertNull((!CompetitionMatchTeamRepo.getById(teamId))!!.timecode)
    }

    @Test
    fun forcePushOverridesTheFreeze() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val teamId = !pushablePreparedTeam(eventId, userId)
        !CompetitionMatchTeamRepo.updateById(teamId) { placesCalculated = true }

        !TimingOfficialTimeService.pushOfficialTimes(
            eventId,
            PushOfficialTimesRequest(listOf(teamId), force = true),
            userId,
        )

        assertEquals(teamId, (!CompetitionMatchTeamRepo.getById(teamId))!!.timecode)
        assertNotNull((!TimingOfficialTimeRepo.getByTeam(teamId))!!.pushedAt)
    }

    @Test
    fun pushWithoutEffectiveTimeFailsEvenWhenForced() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val teamId = !createTestMatchTeam(eventId)
        !TimingOfficialTimeService.setOverride(
            eventId,
            teamId,
            OfficialTimeOverrideRequest(null, null, null, null),
            userId,
        )

        assertKIOFails(
            TimingError.PushConflict(
                listOf(OfficialTimePushConflictDto(teamId, PushConflictReason.NO_EFFECTIVE_TIME))
            )
        ) {
            TimingOfficialTimeService.pushOfficialTimes(
                eventId,
                PushOfficialTimesRequest(listOf(teamId), force = true),
                userId,
            )
        }
    }

    @Test
    fun pushFailsForTeamWithoutOfficialTime() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val teamId = !createTestMatchTeam(eventId)

        assertKIOFails(TimingError.OfficialTimeNotFound) {
            TimingOfficialTimeService.pushOfficialTimes(eventId, PushOfficialTimesRequest(listOf(teamId)), userId)
        }
    }

    @Test
    fun pushIsAllOrNothing() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !disableAutoApply(eventId)
        val startStation = !addTestStation(eventId, userId, TimingStationType.START)
        val finishStation = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val teams = !createTestMatchTeams(eventId, 2)
        teams.forEach { teamId ->
            !addAssignedMark(eventId, userId, startStation, teamId, startMillis)
            !addAssignedMark(eventId, userId, finishStation, teamId, finishMillis)
        }
        !TimingOfficialTimeService.computeOfficialTimes(eventId, userId)
        !CompetitionMatchTeamRepo.updateById(teams[1]) { placesCalculated = true }

        assertKIOFails(
            TimingError.PushConflict(
                listOf(OfficialTimePushConflictDto(teams[1], PushConflictReason.RESULT_FROZEN))
            )
        ) {
            TimingOfficialTimeService.pushOfficialTimes(eventId, PushOfficialTimesRequest(teams), userId)
        }
        assertNull((!CompetitionMatchTeamRepo.getById(teams[0]))!!.timecode)
    }

    // ------------------------------------------------- delete retracted marks

    @Test
    fun deleteRetractedRemovesOnlyRetractedMarks() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)
        val teamId = !createTestMatchTeam(eventId)
        val activeMark = !addAssignedMark(eventId, userId, stationId, teamId, startMillis)
        val retractedMark = !addAssignedMark(eventId, userId, stationId, teamId, finishMillis)
        !TimingService.retractTimeMark(retractedMark, eventId, userId)

        val deleted = (!TimingOfficialTimeService.deleteRetractedMarks(eventId, null)).dto

        assertEquals(listOf(retractedMark), deleted.timeMarks)
        assertEquals(listOf(activeMark), (!TimingTimeMarkRepo.getByEvent(eventId)).map { it.id })
    }

    @Test
    fun deleteRetractedCanBeScopedToAStation() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationA = !addTestStation(eventId, userId)
        val stationB = !addTestStation(eventId, userId)
        val markA = !addAssignedMark(eventId, userId, stationA, !createTestMatchTeam(eventId), startMillis)
        val markB = !addAssignedMark(eventId, userId, stationB, !createTestMatchTeam(eventId), startMillis)
        !TimingService.retractTimeMark(markA, eventId, userId)
        !TimingService.retractTimeMark(markB, eventId, userId)

        val deleted = (!TimingOfficialTimeService.deleteRetractedMarks(eventId, stationA)).dto

        assertEquals(listOf(markA), deleted.timeMarks)
        assertEquals(listOf(markB), (!TimingTimeMarkRepo.getByEvent(eventId)).map { it.id })
    }

    @Test
    fun deleteRetractedFailsForStationOfDifferentEvent() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val (otherEventId, otherUserId) = !createTestEventWithAdmin()
        val otherStation = !addTestStation(otherEventId, otherUserId)

        assertKIOFails(TimingError.EventMismatch) {
            TimingOfficialTimeService.deleteRetractedMarks(eventId, otherStation)
        }
    }

    // ------------------------------------------- push: penalty columns & RaceClocker

    // The pushed timecode already contains the penalty (same convention as the RaceClocker feed:
    // the reported time includes it). `penalty_seconds`/`penalty_note` are the separate display
    // columns everything downstream reads (referee mask, boards, results) to explain why a time
    // deviates - a push has to fill them, or a Leitstand penalty is invisible outside the Leitstand.

    @Test
    fun pushWritesPenaltySecondsAlongsideTheIncludedTime() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val teamId = !pushablePreparedTeam(eventId, userId)
        !TimingOfficialTimeService.setOverride(
            eventId,
            teamId,
            OfficialTimeOverrideRequest(overrideMillis = null, penaltyMillis = 5_000, resultStatus = null),
            userId,
        )

        !TimingOfficialTimeService.pushOfficialTimes(eventId, PushOfficialTimesRequest(listOf(teamId)), userId)

        val team = !CompetitionMatchTeamRepo.getById(teamId)
        assertEquals(5, team!!.penaltySeconds)
        val timecode = !Jooq.query { selectFrom(TIMECODE).where(TIMECODE.ID.eq(teamId)).fetchOne() }
        assertEquals(95_000L, timecode!!.time)
    }

    @Test
    fun pushRoundsAFractionalPenaltyForTheDisplayColumn() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val teamId = !pushablePreparedTeam(eventId, userId)
        !TimingOfficialTimeService.setOverride(
            eventId,
            teamId,
            OfficialTimeOverrideRequest(overrideMillis = null, penaltyMillis = 5_500, resultStatus = null),
            userId,
        )

        !TimingOfficialTimeService.pushOfficialTimes(eventId, PushOfficialTimesRequest(listOf(teamId)), userId)

        // The display column is whole seconds; the exact penalty stays in the pushed time.
        assertEquals(6, (!CompetitionMatchTeamRepo.getById(teamId))!!.penaltySeconds)
        val timecode = !Jooq.query { selectFrom(TIMECODE).where(TIMECODE.ID.eq(teamId)).fetchOne() }
        assertEquals(95_500L, timecode!!.time)
    }

    @Test
    fun pushClearsAStalePenaltyWhenTheOfficialTimeHasNone() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val teamId = !pushablePreparedTeam(eventId, userId)
        !CompetitionMatchTeamRepo.updateById(teamId) {
            penaltySeconds = 10
            penaltyNote = "Frühstart"
        }.orDie()

        !TimingOfficialTimeService.pushOfficialTimes(eventId, PushOfficialTimesRequest(listOf(teamId)), userId)

        // The push is the source of truth for the moment it happens - a leftover manual penalty
        // would claim the pushed time deviates for a reason that no longer exists.
        val team = !CompetitionMatchTeamRepo.getById(teamId)
        assertNull(team!!.penaltySeconds)
        assertNull(team.penaltyNote)
    }

    // Every manual write path pauses a configured RaceClocker auto-pull so the next poll tick does
    // not overwrite what was just written. The push writes the same fields, so it has to do the
    // same - otherwise poll and push overwrite each other on a match with auto-pull enabled.

    @Test
    fun pushPausesAConfiguredRaceClockerAutoPull() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val teamId = !pushablePreparedTeam(eventId, userId)
        !Jooq.query {
            update(EVENT)
                .set(EVENT.RACECLOCKER_AUTO_PULL, true)
                .set(EVENT.TIMING_SYSTEM, TimingSystem.RACECLOCKER.name)
                .where(EVENT.ID.eq(eventId))
                .execute()
        }

        !TimingOfficialTimeService.pushOfficialTimes(eventId, PushOfficialTimesRequest(listOf(teamId)), userId)

        val matchId = (!CompetitionMatchTeamRepo.getById(teamId))!!.competitionMatch
        val match = !Jooq.query {
            selectFrom(COMPETITION_MATCH).where(COMPETITION_MATCH.COMPETITION_SETUP_MATCH.eq(matchId)).fetchOne()
        }
        assertNotNull(match!!.raceclockerAutoPausedAt)
    }

    @Test
    fun pushLeavesAutoPullUntouchedWithoutRaceClocker() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val teamId = !pushablePreparedTeam(eventId, userId)

        !TimingOfficialTimeService.pushOfficialTimes(eventId, PushOfficialTimesRequest(listOf(teamId)), userId)

        // Without RaceClocker configured there is nothing to pause - a set timestamp would render
        // a misleading "Automatischer Abruf pausiert" note on the match.
        val matchId = (!CompetitionMatchTeamRepo.getById(teamId))!!.competitionMatch
        val match = !Jooq.query {
            selectFrom(COMPETITION_MATCH).where(COMPETITION_MATCH.COMPETITION_SETUP_MATCH.eq(matchId)).fetchOne()
        }
        assertNull(match!!.raceclockerAutoPausedAt)
    }

}

/** Schalter „Automatische Übernahme" der Veranstaltung ausstellen - für Tests des reinen Push-Pfads. */
private fun disableAutoApply(eventId: UUID): App<Any?, Unit> = Jooq.query {
    update(EVENT).set(EVENT.TIMING_AUTO_APPLY, false).where(EVENT.ID.eq(eventId)).execute()
}.orDie().map { }

/** A team with a computed official time of [durationMillis], ready to be pushed. */
private fun pushablePreparedTeam(
    eventId: UUID,
    userId: UUID,
    durationMillis: Long = 90_000,
): App<Any?, UUID> = KIO.comprehension {
    val startStation = !addTestStation(eventId, userId, TimingStationType.START)
    val finishStation = !addTestStation(eventId, userId, TimingStationType.FINISH)
    val teamId = !createTestMatchTeam(eventId)
    !addAssignedMark(eventId, userId, startStation, teamId, START_MILLIS)
    !addAssignedMark(eventId, userId, finishStation, teamId, START_MILLIS + durationMillis)
    !TimingOfficialTimeService.computeOfficialTimes(eventId, userId)
    KIO.ok(teamId)
}

private const val START_MILLIS = 1755430000000L
