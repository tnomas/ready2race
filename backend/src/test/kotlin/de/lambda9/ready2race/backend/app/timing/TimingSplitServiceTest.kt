package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.club.seedClubChain
import de.lambda9.ready2race.backend.app.competitionExecution.boundary.CompetitionExecutionService
import de.lambda9.ready2race.backend.app.competitionExecution.control.CompetitionMatchTeamLapRepo
import de.lambda9.ready2race.backend.app.competitionExecution.control.CompetitionMatchTeamRepo
import de.lambda9.ready2race.backend.app.event.control.EventRepo
import de.lambda9.ready2race.backend.app.timing.boundary.TimingOfficialTimeService
import de.lambda9.ready2race.backend.app.timing.boundary.TimingService
import de.lambda9.ready2race.backend.app.timing.entity.AssignTimeMarkRequest
import de.lambda9.ready2race.backend.app.timing.entity.CompetitionTimingStationEntry
import de.lambda9.ready2race.backend.app.timing.entity.CompetitionTimingStationsRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationType
import de.lambda9.ready2race.backend.app.timingConfig.entity.TimingSystem
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.database.SYSTEM_USER
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionMatchTeamLapRecord
import de.lambda9.ready2race.testing.testComprehension
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.orDie
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Die Übernahme der Streckenmarken in die Zwischenzeiten gegen echtes Postgres: Der Weg von der
 * zugeordneten Marke bis zur Zeile in `competition_match_team_lap`, den die Anzeigen ohnehin
 * lesen — und die Grenze, an der der zweite Schreiber derselben Tabelle beginnt.
 *
 * Ausgelöst wird nie von Hand: Jeder Fall geht über die Zuordnung selbst, also über genau den
 * Weg, den ein Posten am Renntag geht.
 */
class TimingSplitServiceTest {

    private fun setEventTimingSystem(eventId: UUID, system: TimingSystem): App<Any?, Unit> =
        KIO.comprehension {
            val event = (!EventRepo.get(eventId).orDie())!!
            !EventRepo.update(event) { timingSystem = system.name }.orDie()
            KIO.ok(Unit)
        }

    /** Ein Posten mit sprechendem Namen — der Name ist die Beschriftung der Zwischenzeit. */
    private fun addStation(
        eventId: UUID,
        userId: UUID,
        name: String,
        type: TimingStationType,
    ): App<Any?, UUID> = KIO.comprehension {
        val created = !TimingService.addStation(
            TimingStationRequest(name = name, type = type, sorting = 0),
            userId,
            eventId,
        )
        KIO.ok((created as ApiResponse.Created).id)
    }

    private fun setStations(
        eventId: UUID,
        userId: UUID,
        competitionId: UUID,
        vararg entries: Pair<UUID, Int>,
    ): App<Any?, Unit> = KIO.comprehension {
        !TimingService.setCompetitionStations(
            CompetitionTimingStationsRequest(
                stations = entries.map { (station, meters) ->
                    CompetitionTimingStationEntry(timingStation = station, distanceMeters = meters)
                },
            ),
            userId,
            competitionId,
            eventId,
        )
        KIO.ok(Unit)
    }

    private fun lapsOf(teamId: UUID) =
        CompetitionMatchTeamLapRepo.getByTeams(listOf(teamId)).orDie()
            .map { records -> records.sortedBy { it.position } }

    /**
     * Der Kern: Eine Marke auf einem Streckenposten, einem Boot zugeordnet, wird zur Zwischenzeit
     * — Fahrzeit seit der gemessenen Startmarke, beschriftet mit dem Namen des Postens.
     */
    @Test
    fun `eine zugeordnete Streckenmarke wird zur Zwischenzeit`() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !setEventTimingSystem(eventId, TimingSystem.INTERN)
        val fixture = !createTestMatchFixture(eventId)
        val teamId = fixture.teamIds.single()

        val startId = !addStation(eventId, userId, "Startturm", TimingStationType.START)
        val bojeId = !addStation(eventId, userId, "Boje 1", TimingStationType.SPLIT)
        !setStations(eventId, userId, fixture.competitionId, startId to 0, bojeId to 1000)

        !addAssignedMark(eventId, userId, startId, teamId, 10_000)
        !addAssignedMark(eventId, userId, bojeId, teamId, 100_000)

        val laps = !lapsOf(teamId)
        assertEquals(1, laps.size)
        assertEquals(1, laps.single().position)
        assertEquals("Boje 1", laps.single().name)
        assertEquals(90_000L, laps.single().lapMillis)
    }

    /**
     * Zwei Posten, zwei Zeilen — in der Reihenfolge der STRECKE, nicht der Erfassung. Die Marken
     * kommen bewusst verkehrt herum herein: Nur die Distanz kann die Reihenfolge erklären.
     */
    @Test
    fun `zwei Posten ergeben zwei Zeilen in Distanz-Reihenfolge`() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !setEventTimingSystem(eventId, TimingSystem.INTERN)
        val fixture = !createTestMatchFixture(eventId)
        val teamId = fixture.teamIds.single()

        val startId = !addStation(eventId, userId, "Startturm", TimingStationType.START)
        val bojeId = !addStation(eventId, userId, "Boje 1", TimingStationType.SPLIT)
        val bruecke = !addStation(eventId, userId, "Brücke", TimingStationType.SPLIT)
        !setStations(eventId, userId, fixture.competitionId, startId to 0, bojeId to 1000, bruecke to 2000)

        !addAssignedMark(eventId, userId, startId, teamId, 10_000)
        !addAssignedMark(eventId, userId, bruecke, teamId, 190_000)
        !addAssignedMark(eventId, userId, bojeId, teamId, 100_000)

        val laps = !lapsOf(teamId)
        assertEquals(listOf(1, 2), laps.map { it.position })
        assertEquals(listOf("Boje 1", "Brücke"), laps.map { it.name })
        assertEquals(listOf(90_000L, 180_000L), laps.map { it.lapMillis })
    }

    /**
     * Wird die Zuordnung wieder gelöst, verschwindet die Zeile. Ohne das Abräumen bliebe eine
     * Zwischenzeit am Boot stehen, deren Marke keinem Boot mehr gehört — der Upsert allein
     * schreibt nur, er räumt nicht.
     */
    @Test
    fun `eine zurückgenommene Zuordnung räumt ihre Zeile wieder ab`() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !setEventTimingSystem(eventId, TimingSystem.INTERN)
        val fixture = !createTestMatchFixture(eventId)
        val teamId = fixture.teamIds.single()

        val startId = !addStation(eventId, userId, "Startturm", TimingStationType.START)
        val bojeId = !addStation(eventId, userId, "Boje 1", TimingStationType.SPLIT)
        !setStations(eventId, userId, fixture.competitionId, startId to 0, bojeId to 1000)

        !addAssignedMark(eventId, userId, startId, teamId, 10_000)
        val markId = !addAssignedMark(eventId, userId, bojeId, teamId, 100_000)
        assertEquals(1, (!lapsOf(teamId)).size)

        !TimingService.assignTimeMark(AssignTimeMarkRequest(null), userId, markId, eventId)

        assertEquals(emptyList(), !lapsOf(teamId))
    }

    /**
     * Eine Korrektur an der Strecke wirkt SOFORT und nicht erst mit der nächsten Marke. Der Fall
     * mit den schlimmsten Folgen ist der Tausch: Werden die Meter zweier Posten vertauscht, muss
     * auch die Beschriftung mitwandern — sonst stünde nicht ein falscher Meter da, sondern eine
     * vertauschte Strecke. Und ausgerechnet abends, beim Aufräumen der Ergebnisse, kommt danach
     * gar keine Marke mehr.
     */
    @Test
    fun `getauschte Meter tauschen auch die Zwischenzeiten`() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !setEventTimingSystem(eventId, TimingSystem.INTERN)
        val fixture = !createTestMatchFixture(eventId)
        val teamId = fixture.teamIds.single()

        val startId = !addStation(eventId, userId, "Startturm", TimingStationType.START)
        val bojeId = !addStation(eventId, userId, "Boje 1", TimingStationType.SPLIT)
        val bruecke = !addStation(eventId, userId, "Brücke", TimingStationType.SPLIT)
        !setStations(eventId, userId, fixture.competitionId, startId to 0, bojeId to 1000, bruecke to 2000)

        !addAssignedMark(eventId, userId, startId, teamId, 10_000)
        !addAssignedMark(eventId, userId, bojeId, teamId, 100_000)
        !addAssignedMark(eventId, userId, bruecke, teamId, 190_000)
        assertEquals(listOf("Boje 1", "Brücke"), (!lapsOf(teamId)).map { it.name })

        // Die Meter waren vertauscht - die Brücke liegt in Wahrheit vor der Boje.
        !setStations(eventId, userId, fixture.competitionId, startId to 0, bruecke to 1000, bojeId to 2000)

        val laps = !lapsOf(teamId)
        assertEquals(listOf("Brücke", "Boje 1"), laps.map { it.name }, "Die Strecke steht verkehrt herum")
        assertEquals(listOf(180_000L, 90_000L), laps.map { it.lapMillis })
    }

    /**
     * Der Name des Postens IST die Beschriftung der Zwischenzeit. Wird er berichtigt, muss die
     * Berichtigung in die bereits geschriebenen Zeilen wandern — sonst trägt derselbe Punkt der
     * Strecke zwei Namen, je nachdem, wo man hinsieht.
     */
    @Test
    fun `ein umbenannter Posten benennt seine Zwischenzeit mit um`() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !setEventTimingSystem(eventId, TimingSystem.INTERN)
        val fixture = !createTestMatchFixture(eventId)
        val teamId = fixture.teamIds.single()

        val startId = !addStation(eventId, userId, "Startturm", TimingStationType.START)
        val bojeId = !addStation(eventId, userId, "Boje 1", TimingStationType.SPLIT)
        !setStations(eventId, userId, fixture.competitionId, startId to 0, bojeId to 1000)

        !addAssignedMark(eventId, userId, startId, teamId, 10_000)
        !addAssignedMark(eventId, userId, bojeId, teamId, 100_000)
        assertEquals("Boje 1", (!lapsOf(teamId)).single().name)

        !TimingService.updateStation(
            TimingStationRequest(name = "Nordmole", type = TimingStationType.SPLIT, sorting = 0),
            userId,
            bojeId,
            eventId,
        )

        assertEquals("Nordmole", (!lapsOf(teamId)).single().name)
    }

    /**
     * Der zurückgesetzte Lauf holt sich seine Zwischenzeiten zurück — und das ist eine
     * Entscheidung, kein Zufall.
     *
     * `resetMatch` löscht die Zeilen, rührt das Timing-Modul aber nicht an: Die Marken bleiben
     * aktiv und zugeordnet, und die nächste Neuberechnung schreibt sie wieder her. Gewollt ist
     * das, weil „Lauf zurücksetzen" das ERGEBNIS abräumt und nicht die MESSUNG — wer die Messung
     * verwerfen will, nimmt den Versuch zurück (`retractMatchAttempt`, eigener Weg, fasst das
     * Timing-Modul sehr wohl an). Ohne diesen Fall bliebe es eine Beobachtung, die beim nächsten
     * Umbau still kippt.
     *
     * Neu gerechnet wird über den „alles neu rechnen"-Knopf, also über einen echten Auslöser.
     */
    @Test
    fun `ein zurückgesetzter Lauf bekommt seine Zwischenzeiten aus den Marken zurück`() = testComprehension {
        val seeded = seedClubChain()
        val event = (!EventRepo.get(seeded.eventId).orDie())!!
        !EventRepo.update(event) { timingSystem = TimingSystem.INTERN.name }.orDie()
        val teamId = (!CompetitionMatchTeamRepo.getByMatch(seeded.matchId).orDie()).single().id!!

        val startId = !addStation(seeded.eventId, SYSTEM_USER, "Startturm", TimingStationType.START)
        val bojeId = !addStation(seeded.eventId, SYSTEM_USER, "Boje 1", TimingStationType.SPLIT)
        !setStations(seeded.eventId, SYSTEM_USER, seeded.competitionId, startId to 0, bojeId to 1000)

        !addAssignedMark(seeded.eventId, SYSTEM_USER, startId, teamId, 10_000)
        !addAssignedMark(seeded.eventId, SYSTEM_USER, bojeId, teamId, 100_000)
        assertEquals(90_000L, (!lapsOf(teamId)).single().lapMillis)

        !CompetitionExecutionService.resetMatch(
            eventId = seeded.eventId,
            competitionId = seeded.competitionId,
            matchId = seeded.matchId,
            userId = SYSTEM_USER,
        )
        assertEquals(emptyList(), !lapsOf(teamId), "resetMatch muss die Zeilen zunächst löschen")

        !TimingOfficialTimeService.computeOfficialTimes(seeded.eventId, SYSTEM_USER)

        val laps = !lapsOf(teamId)
        assertEquals(1, laps.size, "Die Marken sind die Wahrheit - die Zwischenzeit gehört zurück")
        assertEquals("Boje 1", laps.single().name)
        assertEquals(90_000L, laps.single().lapMillis)
    }

    /**
     * Die Grenze zwischen den beiden Schreibern derselben Tabelle: Bei einer
     * RACECLOCKER-Veranstaltung gehören die Zwischenzeiten dem Abruf. Selbst wenn dort Posten
     * eingetragen sind und Marken zugeordnet werden, rührt diese Schicht die Zeilen nicht an —
     * weder schreibend noch räumend. Die vorgelegte Zeile steht für das, was der Abruf geschrieben
     * hat.
     */
    @Test
    fun `eine RaceClocker-Veranstaltung bleibt unberührt`() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !setEventTimingSystem(eventId, TimingSystem.RACECLOCKER)
        val fixture = !createTestMatchFixture(eventId)
        val teamId = fixture.teamIds.single()

        !CompetitionMatchTeamLapRepo.create(
            listOf(
                CompetitionMatchTeamLapRecord(
                    id = UUID.randomUUID(),
                    competitionMatchTeam = teamId,
                    position = 1,
                    name = "Runde 1",
                    lapMillis = 42_000,
                    createdAt = LocalDateTime.now(),
                    createdBy = userId,
                )
            )
        ).orDie()

        val startId = !addStation(eventId, userId, "Startturm", TimingStationType.START)
        val bojeId = !addStation(eventId, userId, "Boje 1", TimingStationType.SPLIT)
        !setStations(eventId, userId, fixture.competitionId, startId to 0, bojeId to 1000)

        !addAssignedMark(eventId, userId, startId, teamId, 10_000)
        !addAssignedMark(eventId, userId, bojeId, teamId, 100_000)

        val laps = !lapsOf(teamId)
        assertEquals(1, laps.size)
        assertEquals("Runde 1", laps.single().name)
        assertEquals(42_000L, laps.single().lapMillis)
    }
}
