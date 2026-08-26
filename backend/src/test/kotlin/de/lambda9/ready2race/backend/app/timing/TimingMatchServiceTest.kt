package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.event.control.EventRepo
import de.lambda9.ready2race.backend.app.competitionExecution.control.CompetitionMatchRepo
import de.lambda9.ready2race.backend.app.timing.boundary.TimingMatchService
import de.lambda9.ready2race.backend.app.timing.boundary.TimingModeService
import de.lambda9.ready2race.backend.app.timing.boundary.TimingSequenceService
import de.lambda9.ready2race.backend.app.timing.entity.CreateSequenceRequest
import de.lambda9.ready2race.backend.app.timing.entity.SequenceMode
import de.lambda9.ready2race.backend.app.timing.entity.TimingMatchProgress
import de.lambda9.ready2race.backend.app.timing.entity.TimingModeRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingStartGrouping
import de.lambda9.ready2race.backend.app.timing.boundary.TimingService
import de.lambda9.ready2race.backend.app.timing.entity.CompetitionTimingStationEntry
import de.lambda9.ready2race.backend.app.timing.entity.CompetitionTimingStationsRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationType
import de.lambda9.ready2race.backend.app.timingConfig.entity.TimingSystem
import de.lambda9.ready2race.backend.app.timingProfile.boundary.TimingProfileService
import de.lambda9.ready2race.backend.app.timingProfile.entity.TimingProfileAssignmentRequest
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

    private fun assignProfile(
        eventId: UUID,
        userId: UUID,
        profile: UUID,
        competition: UUID? = null,
        round: UUID? = null,
        match: UUID? = null,
    ): App<Any?, Unit> = KIO.comprehension {
        !TimingProfileService.upsertAssignment(
            eventId,
            userId,
            TimingProfileAssignmentRequest(competition, round, match, profile),
        )
        KIO.ok(Unit)
    }

    private fun setMatch(
        setupMatchId: UUID,
        f: de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionMatchRecord.() -> Unit,
    ): App<Any?, Unit> = KIO.comprehension {
        !CompetitionMatchRepo.update(setupMatchId, f).orDie()
        KIO.ok(Unit)
    }

    /**
     * Der Zuschnitt hängt allein an der Veranstaltung: Ihre Wettkämpfe sind entweder alle intern
     * gezeitet oder keiner. Ein Wettkampf konnte das früher überschreiben - zwei Zeitnahme-
     * Softwares in einer Regatta gibt es aber nicht.
     */
    @Test
    fun onlyInternallyTimedEventsAppear() = testComprehension {
        val (internEventId, _) = !createTestEventWithAdmin()
        val (externEventId, _) = !createTestEventWithAdmin()
        !setEventTimingSystem(internEventId, TimingSystem.INTERN)
        !setEventTimingSystem(externEventId, TimingSystem.RACECLOCKER)
        val internFixture = !createTestMatchFixture(internEventId)
        !createTestMatchFixture(externEventId)

        assertEquals(
            listOf(internFixture.setupMatchId),
            (!TimingMatchService.getMatches(internEventId)).data.map { it.competitionSetupMatch },
        )
        assertEquals(emptyList(), (!TimingMatchService.getMatches(externEventId)).data)
    }

    /**
     * Ein Zwischenzeit-Posten sieht nur die Wettkaempfe, auf deren Strecke er steht. Der Grund
     * steckt nicht in der Bequemlichkeit, sondern in der Rechnung: Seine Marke wird nur dort eine
     * Zwischenzeit, wo er mit einem Meter eingetragen ist -- anderswo erfasst er ins Leere.
     */
    @Test
    fun splitStationSeesOnlyItsOwnCourse() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !setEventTimingSystem(eventId, TimingSystem.INTERN)
        val onCourse = !createTestMatchFixture(eventId)
        val elsewhere = !createTestMatchFixture(eventId)
        val splitId = !addTestStation(eventId, userId, TimingStationType.SPLIT)

        // Nur der eine Wettkampf traegt den Posten auf seiner Strecke.
        !TimingService.setCompetitionStations(
            eventId = eventId,
            competitionId = onCourse.competitionId,
            request = CompetitionTimingStationsRequest(
                stations = listOf(CompetitionTimingStationEntry(splitId, 250)),
            ),
            userId = userId,
        )

        // Ohne Posten-Angabe bleibt die Liste vollstaendig - Leitstand und Startbildschirm.
        assertEquals(
            setOf(onCourse.setupMatchId, elsewhere.setupMatchId),
            (!TimingMatchService.getMatches(eventId)).data.map { it.competitionSetupMatch }.toSet(),
        )

        assertEquals(
            listOf(onCourse.setupMatchId),
            (!TimingMatchService.getMatches(eventId, splitId)).data.map { it.competitionSetupMatch },
        )
    }

    /**
     * Start- und Zielposten werden NICHT zugeschnitten: Ihre Marken speisen die offizielle Zeit
     * und funktionieren ohne jede Streckenzuordnung. Ein vergessener Eintrag darf am Renntag nicht
     * die Zeitnahme lahmlegen.
     */
    @Test
    fun startAndFinishStationsAreNeverNarrowed() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !setEventTimingSystem(eventId, TimingSystem.INTERN)
        val fixture = !createTestMatchFixture(eventId)
        val startId = !addTestStation(eventId, userId, TimingStationType.START)
        val finishId = !addTestStation(eventId, userId, TimingStationType.FINISH)

        // Kein einziger Wettkampf hat Posten auf der Strecke eingetragen.
        assertEquals(
            listOf(fixture.setupMatchId),
            (!TimingMatchService.getMatches(eventId, startId)).data.map { it.competitionSetupMatch },
        )
        assertEquals(
            listOf(fixture.setupMatchId),
            (!TimingMatchService.getMatches(eventId, finishId)).data.map { it.competitionSetupMatch },
        )
    }

    /**
     * Eine unbekannte Posten-Kennung schneidet bewusst NICHTS zu: Die Anzeige soll an einer
     * unklaren Kennung nicht stumm verarmen, sondern sich verhalten wie ohne Angabe.
     */
    @Test
    fun unknownStationNarrowsNothing() = testComprehension {
        val (eventId, _) = !createTestEventWithAdmin()
        !setEventTimingSystem(eventId, TimingSystem.INTERN)
        val fixture = !createTestMatchFixture(eventId)

        assertEquals(
            listOf(fixture.setupMatchId),
            (!TimingMatchService.getMatches(eventId, UUID.randomUUID())).data
                .map { it.competitionSetupMatch },
        )
    }

    // Der Kurzname des Wettkampfs (Kürzel, z. B. "CM 4x+") wandert mit in die Startliste - die
    // Tagesablauf-Spalte der Boards zeigt Kennung + Kürzel wie der Zeitplan in seiner Kurzform;
    // ohne gepflegtes Kürzel bleibt der volle Name der Fallback (null bleibt null).
    @Test
    fun competitionShortNameIsCarried() = testComprehension {
        val (eventId, _) = !createTestEventWithAdmin()
        !setEventTimingSystem(eventId, TimingSystem.INTERN)
        val withShort = !createTestMatchFixture(eventId, shortName = "CM 4x+")
        val withoutShort = !createTestMatchFixture(eventId)

        val list = (!TimingMatchService.getMatches(eventId)).data
        val byId = list.associateBy { it.competitionSetupMatch }

        assertEquals("CM 4x+", byId[withShort.setupMatchId]!!.competitionShortName)
        assertEquals(null, byId[withoutShort.setupMatchId]!!.competitionShortName)
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
            TimingModeRequest("Massenstart", TimingStartGrouping.WELLE, null, 10),
            userId,
            eventId,
        )) as ApiResponse.Created).id
        val roundMode = ((!TimingModeService.addMode(
            TimingModeRequest("Timetrial 30s", TimingStartGrouping.EINZEL, 30, 10),
            userId,
            eventId,
        )) as ApiResponse.Created).id
        !assignProfile(eventId, userId, competitionMode, competition = fixture.competitionId)
        !assignProfile(eventId, userId, roundMode, competition = fixture.competitionId, round = fixture.roundId)

        val match = (!TimingMatchService.getMatches(eventId)).data.single()

        assertEquals(roundMode, match.timingMode?.id, "Der Runden-Eintrag schlägt den Wettkampf-Eintrag")
        assertEquals(30, match.timingMode?.intervalSeconds)
    }

    /**
     * Die vierte Ebene am Posten: Eine Partie-Zuordnung schlägt die des Wettkampfs. Der Fall, für
     * den sie gebaut wurde, ist ein Wettkampf, dessen Qualifikation ein Zeitfahren ist und dessen
     * übrige Läufe im Wellenstart fahren.
     */
    @Test
    fun aMatchAssignmentBeatsTheCompetition() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !setEventTimingSystem(eventId, TimingSystem.INTERN)
        val fixture = !createTestMatchFixture(eventId)
        val competitionMode = ((!TimingModeService.addMode(
            TimingModeRequest("Massenstart", TimingStartGrouping.WELLE, null, 10),
            userId,
            eventId,
        )) as ApiResponse.Created).id
        val matchMode = ((!TimingModeService.addMode(
            TimingModeRequest("Timetrial 30s", TimingStartGrouping.EINZEL, 30, 10),
            userId,
            eventId,
        )) as ApiResponse.Created).id
        !assignProfile(eventId, userId, competitionMode, competition = fixture.competitionId)
        !assignProfile(
            eventId,
            userId,
            matchMode,
            competition = fixture.competitionId,
            round = fixture.roundId,
            match = fixture.setupMatchId,
        )

        val match = (!TimingMatchService.getMatches(eventId)).data.single()

        assertEquals(matchMode, match.timingMode?.id, "Der Partie-Eintrag schlägt den Wettkampf-Eintrag")
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
