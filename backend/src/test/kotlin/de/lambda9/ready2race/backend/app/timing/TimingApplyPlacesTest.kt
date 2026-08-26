package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.competitionExecution.control.CompetitionMatchTeamRepo
import de.lambda9.ready2race.backend.app.competitionSetup.control.CompetitionSetupRoundRepo
import de.lambda9.ready2race.backend.app.competitionSetup.entity.CompetitionSetupPlacesOption
import de.lambda9.ready2race.backend.app.timing.boundary.TimingOfficialTimeService
import de.lambda9.ready2race.backend.app.timing.boundary.TimingService
import de.lambda9.ready2race.backend.app.timing.control.TimingOfficialTimeRepo
import de.lambda9.ready2race.backend.app.timing.entity.*
import de.lambda9.ready2race.backend.app.timingConfig.boundary.TimingConfigService
import de.lambda9.ready2race.backend.app.timingConfig.entity.EventTimingConfigRequest
import de.lambda9.ready2race.backend.app.timingConfig.entity.TimingPrecision
import de.lambda9.ready2race.backend.app.timingConfig.entity.TimingSystem
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionSetupRoundRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_MATCH
import de.lambda9.ready2race.backend.database.generated.tables.references.EVENT
import de.lambda9.ready2race.testing.testComprehension
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.orDie
import de.lambda9.tailwind.jooq.Jooq
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Mit der Zeit kommt der Platz: Die Echtzeit-Übernahme leitet nach jedem Schreiben die Plätze des
 * Laufs aus den Zeiten ab - vorläufig, solange Boote unterwegs sind, mit ehrlichen Gleichständen
 * auf der veröffentlichten Genauigkeitsstufe (1, 1, 3), und symmetrisch zur Rücknahme. Fremde
 * Plätze bleiben unberührt, und beendet wird ein Lauf hierdurch niemals.
 */
class TimingApplyPlacesTest {

    private val startMillis = 1755430000000L

    private data class Course(val startStation: UUID, val finishStation: UUID, val teamIds: List<UUID>)

    /** Start- und Zielposten plus [teamCount] Boote im SELBEN Lauf. */
    private fun prepareCourse(eventId: UUID, userId: UUID, teamCount: Int): App<Any?, Course> =
        KIO.comprehension {
            val startStation = !addTestStation(eventId, userId, TimingStationType.START)
            val finishStation = !addTestStation(eventId, userId, TimingStationType.FINISH)
            val teamIds = !createTestMatchTeams(eventId, teamCount)
            KIO.ok(Course(startStation, finishStation, teamIds))
        }

    private fun place(teamId: UUID): App<Any?, Int?> =
        CompetitionMatchTeamRepo.getById(teamId).orDie().map { it?.place }

    private fun setPrecision(eventId: UUID, userId: UUID, precision: TimingPrecision): App<Any?, Unit> =
        TimingConfigService.updateEventTimingConfig(
            eventId,
            userId,
            EventTimingConfigRequest(
                timingSystem = TimingSystem.INTERN,
                startlistConfig = null,
                resultImportConfig = null,
                autoPull = false,
                intervalActiveSeconds = 5,
                intervalUpcomingSeconds = 60,
                watchBeforeMinutes = 15,
                watchAfterMinutes = 120,
                timingPrecision = precision,
                showManualCapture = false,
                startDisplay = null,
            ),
        ).map { }

    // ---------------------------------------------------------------- Plätze kommen mit der Zeit

    // Drei Boote laufen nacheinander ein: Die Plätze stehen nach jedem Einlauf - vorläufig, ohne
    // weiteren Eingriff, und am Ende 1/2/3 in der Reihenfolge der Zeiten.
    @Test
    fun placesAppearProgressivelyAsBoatsFinish() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val course = !prepareCourse(eventId, userId, 3)
        course.teamIds.forEach { teamId ->
            !addAssignedMark(eventId, userId, course.startStation, teamId, startMillis)
        }

        !addAssignedMark(eventId, userId, course.finishStation, course.teamIds[0], startMillis + 92_000L)
        assertEquals(1, !place(course.teamIds[0]))
        assertNull(!place(course.teamIds[1]))
        assertNull(!place(course.teamIds[2]))

        !addAssignedMark(eventId, userId, course.finishStation, course.teamIds[1], startMillis + 94_000L)
        assertEquals(1, !place(course.teamIds[0]))
        assertEquals(2, !place(course.teamIds[1]))

        !addAssignedMark(eventId, userId, course.finishStation, course.teamIds[2], startMillis + 96_000L)
        assertEquals(1, !place(course.teamIds[0]))
        assertEquals(2, !place(course.teamIds[1]))
        assertEquals(3, !place(course.teamIds[2]))
    }

    // Ein später einlaufendes, aber schnelleres Boot (späterer Start) schiebt sich vor: die
    // vorläufigen Plätze wandern - wie auf der Live-Anzeige.
    @Test
    fun aFasterLateFinisherMovesTheEarlierBoatDown() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val course = !prepareCourse(eventId, userId, 2)
        !addAssignedMark(eventId, userId, course.startStation, course.teamIds[0], startMillis)
        !addAssignedMark(eventId, userId, course.finishStation, course.teamIds[0], startMillis + 95_000L)
        assertEquals(1, !place(course.teamIds[0]))

        // Boot 2 startet später und läuft später ein - aber mit der schnelleren Laufzeit.
        !addAssignedMark(eventId, userId, course.startStation, course.teamIds[1], startMillis + 10_000L)
        !addAssignedMark(eventId, userId, course.finishStation, course.teamIds[1], startMillis + 100_000L)

        assertEquals(1, !place(course.teamIds[1]))
        assertEquals(2, !place(course.teamIds[0]))
    }

    // Gleichstand auf der veröffentlichten Stufe: 40 ms Abstand sind bei ZEHNTEL dieselbe Zeit -
    // beide Erste, das dritte Boot Dritter (1, 1, 3).
    @Test
    fun tiesOnThePublishedPrecisionSharePlace() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val course = !prepareCourse(eventId, userId, 3)
        course.teamIds.forEach { teamId ->
            !addAssignedMark(eventId, userId, course.startStation, teamId, startMillis)
        }
        !addAssignedMark(eventId, userId, course.finishStation, course.teamIds[0], startMillis + 91_510L)
        !addAssignedMark(eventId, userId, course.finishStation, course.teamIds[1], startMillis + 91_550L)
        !addAssignedMark(eventId, userId, course.finishStation, course.teamIds[2], startMillis + 93_000L)

        assertEquals(1, !place(course.teamIds[0]))
        assertEquals(1, !place(course.teamIds[1]))
        assertEquals(3, !place(course.teamIds[2]))
    }

    // Genauigkeit umstellen: Was auf HUNDERTSTEL getrennt war, ist es wieder - die Plätze folgen
    // der neuen Stufe in beide Richtungen, ohne dass irgendjemand eingreift.
    @Test
    fun changingThePrecisionMovesThePlacesWithTheNewTies() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val course = !prepareCourse(eventId, userId, 2)
        course.teamIds.forEach { teamId ->
            !addAssignedMark(eventId, userId, course.startStation, teamId, startMillis)
        }
        !addAssignedMark(eventId, userId, course.finishStation, course.teamIds[0], startMillis + 91_510L)
        !addAssignedMark(eventId, userId, course.finishStation, course.teamIds[1], startMillis + 91_550L)
        // ZEHNTEL (Vorgabe): zeitgleich.
        assertEquals(1, !place(course.teamIds[0]))
        assertEquals(1, !place(course.teamIds[1]))

        !setPrecision(eventId, userId, TimingPrecision.HUNDERTSTEL)
        assertEquals(1, !place(course.teamIds[0]))
        assertEquals(2, !place(course.teamIds[1]))

        !setPrecision(eventId, userId, TimingPrecision.ZEHNTEL)
        assertEquals(1, !place(course.teamIds[0]))
        assertEquals(1, !place(course.teamIds[1]))
    }

    // Ein DNS/DNF/DSQ-Boot hat keinen Platz - wie beim Import - und die übrigen zählen ohne Lücke.
    @Test
    fun aFailedBoatHasNoPlaceAndTheRestCloseUp() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val course = !prepareCourse(eventId, userId, 2)
        course.teamIds.forEach { teamId ->
            !addAssignedMark(eventId, userId, course.startStation, teamId, startMillis)
        }
        !addAssignedMark(eventId, userId, course.finishStation, course.teamIds[0], startMillis + 92_000L)
        !addAssignedMark(eventId, userId, course.finishStation, course.teamIds[1], startMillis + 91_000L)
        assertEquals(2, !place(course.teamIds[0]))

        // Das schnellere Boot wird disqualifiziert: Es verliert Zeit und Platz, das andere rückt vor.
        !TimingOfficialTimeService.setOverride(
            eventId,
            course.teamIds[1],
            OfficialTimeOverrideRequest(null, null, null, OfficialTimeResultStatus.DSQ),
            userId,
        )

        assertNull(!place(course.teamIds[1]))
        assertEquals(1, !place(course.teamIds[0]))
        assertTrue((!CompetitionMatchTeamRepo.getById(course.teamIds[1]))!!.failed!!)
    }

    // ---------------------------------------------------------------- Rücknahme-Symmetrie

    // Versuch zurücknehmen: Der Platz des Bootes verschwindet mit der Zeit, die übrigen rücken auf.
    @Test
    fun retractingAFinishRemovesThePlaceAndTheOthersMoveUp() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val course = !prepareCourse(eventId, userId, 2)
        course.teamIds.forEach { teamId ->
            !addAssignedMark(eventId, userId, course.startStation, teamId, startMillis)
        }
        val fastFinish = !addAssignedMark(eventId, userId, course.finishStation, course.teamIds[0], startMillis + 91_000L)
        !addAssignedMark(eventId, userId, course.finishStation, course.teamIds[1], startMillis + 92_000L)
        assertEquals(1, !place(course.teamIds[0]))
        assertEquals(2, !place(course.teamIds[1]))

        !TimingService.retractTimeMark(fastFinish, eventId, userId)

        assertNull(!place(course.teamIds[0]))
        assertEquals(1, !place(course.teamIds[1]))
    }

    // ---------------------------------------------------------------- Fremde Plätze

    // Ein fremder Platz an EINEM Boot friert genau dieses Boot ein (dirty); die eigenen Plätze der
    // übrigen Boote werden weiter gepflegt.
    @Test
    fun aForeignPlaceFreezesOnlyThatBoat() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val course = !prepareCourse(eventId, userId, 3)
        course.teamIds.forEach { teamId ->
            !addAssignedMark(eventId, userId, course.startStation, teamId, startMillis)
        }
        !addAssignedMark(eventId, userId, course.finishStation, course.teamIds[0], startMillis + 92_000L)
        assertEquals(1, !place(course.teamIds[0]))

        // Der Schiedsrichter setzt den Platz von Boot 1 von Hand um - ab jetzt gehört er ihm.
        !CompetitionMatchTeamRepo.updateById(course.teamIds[0]) { place = 5 }.orDie()

        // Zwei weitere Boote laufen ein: Ihre Plätze kommen weiterhin automatisch; das fremde
        // Boot bleibt unangetastet und seine Zeile zeigt die Abweichung.
        !addAssignedMark(eventId, userId, course.finishStation, course.teamIds[1], startMillis + 91_000L)
        !addAssignedMark(eventId, userId, course.finishStation, course.teamIds[2], startMillis + 93_000L)

        assertEquals(5, !place(course.teamIds[0]))
        assertEquals(1, !place(course.teamIds[1]))
        // Boot 1 zählt mit seiner GESCHRIEBENEN Zeit weiter im Feld (92s): Boot 3 ist Dritter.
        assertEquals(3, !place(course.teamIds[2]))
        assertTrue((!TimingOfficialTimeRepo.getByTeam(course.teamIds[0]))!!.dirty!!)
        assertEquals(false, (!TimingOfficialTimeRepo.getByTeam(course.teamIds[1]))!!.dirty!!)
    }

    // ---------------------------------------------------------------- Keine Rundenerzeugung

    // Die kritischste Absicherung: Auch wenn ALLE Boote eines nicht beendeten Laufs ihre Plätze
    // haben, erzeugt die Platz-Fortschreibung weder eine Folgerunde noch einen Beenden-Stempel -
    // die Folgerunden-Automatik hängt an finished_at, und das setzt die Zeitnahme nie.
    @Test
    fun completedPlacesOnAnUnfinishedMatchTriggerNoRoundAndNoFinish() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val startStation = !addTestStation(eventId, userId, TimingStationType.START)
        val finishStation = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val fixture = !createTestMatchFixture(eventId, teamCount = 2)

        // Eine Folgerunde im Setup, noch ohne Läufe - würde irgendetwas die Runde weiterschalten,
        // entstünden hier competition_match-Zeilen.
        val nextRoundId = UUID.randomUUID()
        !CompetitionSetupRoundRepo.create(
            listOf(
                CompetitionSetupRoundRecord(
                    id = nextRoundId,
                    competitionSetup = fixture.competitionPropertiesId,
                    name = "Round 2",
                    required = true,
                    useDefaultSeeding = true,
                    placesOption = CompetitionSetupPlacesOption.ASCENDING.name,
                )
            )
        ).orDie()
        !CompetitionSetupRoundRepo.updateNextRound(fixture.roundId, nextRoundId).orDie()

        fixture.teamIds.forEachIndexed { index, teamId ->
            !addAssignedMark(eventId, userId, startStation, teamId, startMillis)
            !addAssignedMark(eventId, userId, finishStation, teamId, startMillis + 90_000L + index * 2_000L)
        }
        assertEquals(1, !place(fixture.teamIds[0]))
        assertEquals(2, !place(fixture.teamIds[1]))

        val matches = !Jooq.query { selectFrom(COMPETITION_MATCH).fetch() }
        // Nur der eine Lauf der ersten Runde existiert - keine Rundenerzeugung.
        assertEquals(1, matches.size)
        assertNull(matches.single().finishedAt)
    }

    // ---------------------------------------------------------------- Push mit Plätzen

    // Der manuelle Übernahme-Weg (Schalter aus) schreibt die Plätze mit - und ein späterer Push
    // eines schnelleren Boots rückt den früher gepushten Platz nach, ohne dessen Zeit anzufassen.
    @Test
    fun pushDerivesPlacesAndALaterPushMovesThem() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !Jooq.query {
            update(EVENT).set(EVENT.TIMING_AUTO_APPLY, false).where(EVENT.ID.eq(eventId)).execute()
        }.orDie()
        val course = !prepareCourse(eventId, userId, 2)
        course.teamIds.forEach { teamId ->
            !addAssignedMark(eventId, userId, course.startStation, teamId, startMillis)
        }
        !addAssignedMark(eventId, userId, course.finishStation, course.teamIds[0], startMillis + 95_000L)
        !addAssignedMark(eventId, userId, course.finishStation, course.teamIds[1], startMillis + 92_000L)

        !TimingOfficialTimeService.pushOfficialTimes(
            eventId,
            PushOfficialTimesRequest(listOf(course.teamIds[0])),
            userId,
        )
        assertEquals(1, !place(course.teamIds[0]))

        !TimingOfficialTimeService.pushOfficialTimes(
            eventId,
            PushOfficialTimesRequest(listOf(course.teamIds[1])),
            userId,
        )
        assertEquals(1, !place(course.teamIds[1]))
        assertEquals(2, !place(course.teamIds[0]))
    }
}
