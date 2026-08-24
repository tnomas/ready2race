package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.competition.control.CompetitionRepo
import de.lambda9.ready2race.backend.app.event.control.EventRepo
import de.lambda9.ready2race.backend.app.competitionExecution.control.CompetitionMatchRepo
import de.lambda9.ready2race.backend.app.timing.boundary.TimingMatchService
import de.lambda9.ready2race.backend.app.timing.boundary.TimingModeService
import de.lambda9.ready2race.backend.app.timing.boundary.TimingSequenceService
import de.lambda9.ready2race.backend.app.timing.entity.CreateSequenceRequest
import de.lambda9.ready2race.backend.app.timing.entity.SequenceMode
import de.lambda9.ready2race.backend.app.timing.entity.TimingMatchProgress
import de.lambda9.ready2race.backend.app.timing.entity.TimingModeAssignmentRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingModeRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingStartGrouping
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationType
import de.lambda9.ready2race.backend.app.timingConfig.entity.TimingSystem
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.app.App
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.orDie
import de.lambda9.ready2race.testing.testComprehension
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Die Posten-Startliste gegen echtes Postgres: Zuschnitt auf INTERN gezeitete Wettkämpfe,
 * Sortierung (geplante Zeiten vs. ohne Zeiten), eingebetteter aufgelöster Zeitnahmetyp und die
 * Zustandsableitung aus Marken, Sequenzen und finished_at.
 */
class TimingMatchServiceTest {

    private fun setEventTimingSystem(eventId: UUID, system: TimingSystem?): App<Any?, Unit> =
        KIO.comprehension {
            val event = (!EventRepo.get(eventId).orDie())!!
            !EventRepo.update(event) { timingSystem = system?.name }.orDie()
            KIO.ok(Unit)
        }

    private fun setCompetitionTimingSystem(competitionId: UUID, system: TimingSystem?): App<Any?, Unit> =
        KIO.comprehension {
            !CompetitionRepo.update(competitionId) { timingSystem = system?.name }.orDie()
            KIO.ok(Unit)
        }

    private fun setMatch(
        setupMatchId: UUID,
        f: de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionMatchRecord.() -> Unit,
    ): App<Any?, Unit> = KIO.comprehension {
        !CompetitionMatchRepo.update(setupMatchId, f).orDie()
        KIO.ok(Unit)
    }

    @Test
    fun onlyInternallyTimedCompetitionsAppear() = testComprehension {
        val (eventId, _) = !createTestEventWithAdmin()
        val internFixture = !createTestMatchFixture(eventId)
        val externFixture = !createTestMatchFixture(eventId)
        !setCompetitionTimingSystem(internFixture.competitionId, TimingSystem.INTERN)
        !setCompetitionTimingSystem(externFixture.competitionId, TimingSystem.RACECLOCKER)

        val list = (!TimingMatchService.getMatches(eventId)).data

        assertEquals(listOf(internFixture.setupMatchId), list.map { it.competitionSetupMatch })
    }

    // Der Kurzname des Wettkampfs (Kürzel, z. B. "CM 4x+") wandert mit in die Startliste - die
    // Tagesablauf-Spalte der Boards zeigt Kennung + Kürzel wie der Zeitplan in seiner Kurzform;
    // ohne gepflegtes Kürzel bleibt der volle Name der Fallback (null bleibt null).
    @Test
    fun competitionShortNameIsCarried() = testComprehension {
        val (eventId, _) = !createTestEventWithAdmin()
        val withShort = !createTestMatchFixture(eventId, shortName = "CM 4x+")
        val withoutShort = !createTestMatchFixture(eventId)
        !setCompetitionTimingSystem(withShort.competitionId, TimingSystem.INTERN)
        !setCompetitionTimingSystem(withoutShort.competitionId, TimingSystem.INTERN)

        val list = (!TimingMatchService.getMatches(eventId)).data
        val byId = list.associateBy { it.competitionSetupMatch }

        assertEquals("CM 4x+", byId[withShort.setupMatchId]!!.competitionShortName)
        assertEquals(null, byId[withoutShort.setupMatchId]!!.competitionShortName)
    }

    @Test
    fun eventDefaultAppliesAndCompetitionValueWins() = testComprehension {
        val (eventId, _) = !createTestEventWithAdmin()
        val inheriting = !createTestMatchFixture(eventId)
        val overriding = !createTestMatchFixture(eventId)
        !setEventTimingSystem(eventId, TimingSystem.INTERN)
        // Der Wettkampf-Wert gewinnt per coalesce: dieser Wettkampf ist trotz INTERN-Default extern.
        !setCompetitionTimingSystem(overriding.competitionId, TimingSystem.RACECLOCKER)

        val list = (!TimingMatchService.getMatches(eventId)).data

        assertEquals(listOf(inheriting.setupMatchId), list.map { it.competitionSetupMatch })
    }

    @Test
    fun matchesSortByPlannedTimeThenBySetupOrder() = testComprehension {
        val (eventId, _) = !createTestEventWithAdmin()
        !setEventTimingSystem(eventId, TimingSystem.INTERN)
        val nineOclock = !createTestMatchFixture(eventId, identifier = "7")
        val tenOclock = !createTestMatchFixture(eventId, identifier = "5")
        val untimedRace2 = !createTestMatchFixture(eventId, identifier = "2")
        val untimedRace10 = !createTestMatchFixture(eventId, identifier = "10")
        !setMatch(nineOclock.setupMatchId) { startTime = LocalDateTime.of(2026, 8, 23, 9, 0) }
        !setMatch(tenOclock.setupMatchId) { startTime = LocalDateTime.of(2026, 8, 23, 10, 0) }

        val list = (!TimingMatchService.getMatches(eventId)).data

        assertEquals(
            listOf(
                nineOclock.setupMatchId,
                tenOclock.setupMatchId,
                // Ohne Zeit dahinter, Rennnummern numerisch: 2 vor 10.
                untimedRace2.setupMatchId,
                untimedRace10.setupMatchId,
            ),
            list.map { it.competitionSetupMatch },
        )
    }

    @Test
    fun resolvedTimingModeIsEmbeddedAndRoundBeatsCompetition() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !setEventTimingSystem(eventId, TimingSystem.INTERN)
        val fixture = !createTestMatchFixture(eventId)
        val competitionMode = ((!TimingModeService.addMode(
            TimingModeRequest("Massenstart", false, TimingStartGrouping.WELLE, null, 10, null),
            userId,
            eventId,
        )) as ApiResponse.Created).id
        val roundMode = ((!TimingModeService.addMode(
            TimingModeRequest("Timetrial 30s", false, TimingStartGrouping.EINZEL, 30, 10, null),
            userId,
            eventId,
        )) as ApiResponse.Created).id
        !TimingModeService.upsertModeAssignment(
            TimingModeAssignmentRequest(fixture.competitionId, null, competitionMode),
            userId,
            eventId,
        )
        !TimingModeService.upsertModeAssignment(
            TimingModeAssignmentRequest(fixture.competitionId, fixture.roundId, roundMode),
            userId,
            eventId,
        )

        val match = (!TimingMatchService.getMatches(eventId)).data.single()

        assertEquals(roundMode, match.timingMode?.id, "Der Runden-Eintrag schlägt den Wettkampf-Eintrag")
        assertEquals(30, match.timingMode?.intervalSeconds)
    }

    @Test
    fun unconfiguredMatchCarriesNoMode() = testComprehension {
        val (eventId, _) = !createTestEventWithAdmin()
        !setEventTimingSystem(eventId, TimingSystem.INTERN)
        !createTestMatchFixture(eventId)

        val match = (!TimingMatchService.getMatches(eventId)).data.single()

        assertNull(match.timingMode)
    }

    @Test
    fun progressWalksFromOpenViaMarksToFinished() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !setEventTimingSystem(eventId, TimingSystem.INTERN)
        val fixture = !createTestMatchFixture(eventId, teamCount = 2)
        val startStation = !addTestStation(eventId, userId, TimingStationType.START)
        val finishStation = !addTestStation(eventId, userId, TimingStationType.FINISH)

        // Unberührt: offen.
        assertEquals(TimingMatchProgress.OPEN, (!TimingMatchService.getMatches(eventId)).data.single().progress)

        // Ein Team hat eine Startmarke: gestartet.
        !addAssignedMark(eventId, userId, startStation, fixture.teamIds[0], 1_000L)
        val started = (!TimingMatchService.getMatches(eventId)).data.single()
        assertEquals(TimingMatchProgress.STARTED, started.progress)
        assertTrue(started.teams.single { it.competitionMatchTeam == fixture.teamIds[0] }.started)
        assertTrue(started.teams.none { it.finished })

        // Nur eines von zwei Booten im Ziel: weiterhin gestartet, das Flag zeigt das fehlende Boot.
        !addAssignedMark(eventId, userId, finishStation, fixture.teamIds[0], 61_000L)
        assertEquals(TimingMatchProgress.STARTED, (!TimingMatchService.getMatches(eventId)).data.single().progress)

        // Beide im Ziel: FINISHED.
        !addAssignedMark(eventId, userId, startStation, fixture.teamIds[1], 2_000L)
        !addAssignedMark(eventId, userId, finishStation, fixture.teamIds[1], 62_000L)
        assertEquals(TimingMatchProgress.FINISHED, (!TimingMatchService.getMatches(eventId)).data.single().progress)
    }

    @Test
    fun activeSequenceShowsAsStarting() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !setEventTimingSystem(eventId, TimingSystem.INTERN)
        val fixture = !createTestMatchFixture(eventId)
        val startStation = !addTestStation(eventId, userId, TimingStationType.START)
        !TimingSequenceService.createSequence(
            CreateSequenceRequest(
                station = startStation,
                mode = SequenceMode.MASS,
                intervalMillis = null,
                leadInMillis = null,
                teams = fixture.teamIds,
            ),
            userId,
            eventId,
        )

        val match = (!TimingMatchService.getMatches(eventId)).data.single()

        assertEquals(TimingMatchProgress.STARTING, match.progress)
    }

    @Test
    fun persistedFinishWinsOverEverything() = testComprehension {
        val (eventId, _) = !createTestEventWithAdmin()
        !setEventTimingSystem(eventId, TimingSystem.INTERN)
        val fixture = !createTestMatchFixture(eventId)
        !setMatch(fixture.setupMatchId) { finishedAt = LocalDateTime.now() }

        val match = (!TimingMatchService.getMatches(eventId)).data.single()

        assertEquals(TimingMatchProgress.FINISHED, match.progress)
    }

    @Test
    fun byeMatchesAreExcluded() = testComprehension {
        val (eventId, _) = !createTestEventWithAdmin()
        !setEventTimingSystem(eventId, TimingSystem.INTERN)
        val racing = !createTestMatchFixture(eventId)
        val bye = !createTestMatchFixture(eventId)
        val mustRaceBye = !createTestMatchFixture(eventId)
        !setMatch(bye.setupMatchId) { byeName = "Freilos 1" }
        !setMatch(mustRaceBye.setupMatchId) {
            byeName = "Freilos 2"
            byeMustRace = true
        }

        val list = (!TimingMatchService.getMatches(eventId)).data

        assertEquals(
            setOf(racing.setupMatchId, mustRaceBye.setupMatchId),
            list.map { it.competitionSetupMatch }.toSet(),
        )
    }

    @Test
    fun teamsAreSortedByStartNumberAndCarryNames() = testComprehension {
        val (eventId, _) = !createTestEventWithAdmin()
        !setEventTimingSystem(eventId, TimingSystem.INTERN)
        val fixture = !createTestMatchFixture(eventId, teamCount = 3)

        val match = (!TimingMatchService.getMatches(eventId)).data.single()

        assertEquals(listOf(1, 2, 3), match.teams.map { it.startNumber })
        assertTrue(match.teams.all { it.clubName?.startsWith("Timing Test Club-") == true })
    }
}
