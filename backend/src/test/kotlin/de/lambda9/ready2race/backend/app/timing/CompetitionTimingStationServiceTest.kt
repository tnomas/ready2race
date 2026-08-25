package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.timing.boundary.TimingService
import de.lambda9.ready2race.backend.app.timing.entity.CompetitionTimingStationEntry
import de.lambda9.ready2race.backend.app.timing.entity.CompetitionTimingStationError
import de.lambda9.ready2race.backend.app.timing.entity.CompetitionTimingStationsRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationType
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.testing.testComprehension
import de.lambda9.tailwind.core.KIO
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Die Posten auf der Strecke eines Wettkampfs gegen echtes Postgres: Setzen, Lesen, Ersetzen und
 * die beiden Ablehnungen, die die Datenbank für sich genommen nicht leistet — der Fremdschlüssel
 * kennt die Veranstaltung nicht, und der Doppeleintrag käme still durch.
 */
class CompetitionTimingStationServiceTest {

    private fun request(vararg entries: Pair<UUID, Int>) = CompetitionTimingStationsRequest(
        stations = entries.map { (station, meters) ->
            CompetitionTimingStationEntry(timingStation = station, distanceMeters = meters)
        },
    )

    /**
     * Ein Posten mit gewähltem Namen und gewählter Leitstand-Sortierung — [addTestStation] vergibt
     * beides nicht frei genug für die Reihenfolge-Fälle.
     */
    private fun addStation(
        eventId: UUID,
        userId: UUID,
        name: String,
        sorting: Int,
        type: TimingStationType = TimingStationType.SPLIT,
    ): App<Any?, UUID> = KIO.comprehension {
        val created = !TimingService.addStation(
            TimingStationRequest(name = name, type = type, sorting = sorting),
            userId,
            eventId,
        )
        KIO.ok((created as ApiResponse.Created).id)
    }

    /**
     * Die Liste kommt nach DISTANZ zurück, nicht nach der Leitstand-Sortierung: Beide Posten
     * tragen `sorting = 0` (der Testhelfer setzt nichts anderes), die Reihenfolge kann also nur
     * aus dem Meter kommen. Gesetzt wird bewusst in umgekehrter Reihenfolge.
     */
    @Test
    fun setAndReadReturnsStationsOrderedByDistance() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val fixture = !createTestMatchFixture(eventId)
        val startId = !addTestStation(eventId, userId, TimingStationType.START)
        val moleId = !addTestStation(eventId, userId, TimingStationType.SPLIT)

        !TimingService.setCompetitionStations(
            request(moleId to 250, startId to 0),
            userId,
            fixture.competitionId,
            eventId,
        )

        val stations = (!TimingService.getCompetitionStations(fixture.competitionId, eventId)).data
        assertEquals(listOf(startId, moleId), stations.map { it.timingStation })
        assertEquals(listOf(0, 250), stations.map { it.distanceMeters })
        // Name und Typ kommen vom Posten der Veranstaltung mit - ohne sie wäre die Liste unlesbar.
        assertEquals(TimingStationType.START, stations.first().type)
        assertEquals(TimingStationType.SPLIT, stations.last().type)
        assertEquals(2, stations.map { it.name }.distinct().size)
    }

    /**
     * Das PUT ersetzt die ganze Liste: Was nicht mehr dabei ist, verschwindet; was dabei bleibt,
     * zieht seinen neuen Meter nach (und legt keine zweite Zeile an - das verböte der
     * Unique-Index).
     */
    @Test
    fun secondPutReplacesTheWholeList() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val fixture = !createTestMatchFixture(eventId)
        val startId = !addTestStation(eventId, userId, TimingStationType.START)
        val moleId = !addTestStation(eventId, userId, TimingStationType.SPLIT)

        !TimingService.setCompetitionStations(
            request(startId to 0, moleId to 250),
            userId,
            fixture.competitionId,
            eventId,
        )
        !TimingService.setCompetitionStations(
            request(moleId to 3000),
            userId,
            fixture.competitionId,
            eventId,
        )

        val stations = (!TimingService.getCompetitionStations(fixture.competitionId, eventId)).data
        assertEquals(1, stations.size)
        assertEquals(moleId, stations.single().timingStation)
        assertEquals(3000, stations.single().distanceMeters)
    }

    /**
     * Der Posten einer fremden Regatta: Der Fremdschlüssel ließe die Zeile zu (er kennt die
     * Veranstaltung nicht), fachlich wäre sie ein Posten, den dieser Wettkampf nie passiert.
     */
    @Test
    fun stationOfAnotherEventIsRejected() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val (otherEventId, otherUserId) = !createTestEventWithAdmin()
        val fixture = !createTestMatchFixture(eventId)
        val foreignStationId = !addTestStation(otherEventId, otherUserId, TimingStationType.FINISH)

        assertKIOFails(CompetitionTimingStationError.StationNotFound) {
            TimingService.setCompetitionStations(
                request(foreignStationId to 1000),
                userId,
                fixture.competitionId,
                eventId,
            )
        }

        assertEquals(
            emptyList(),
            (!TimingService.getCompetitionStations(fixture.competitionId, eventId)).data,
        )
    }

    /**
     * Zweimal derselbe Posten: Ohne die ausdrückliche Ablehnung liefe das PUT durch und der zweite
     * Meter überschriebe still den ersten (das Schreiben setzt je Posten ein `on conflict do
     * update`) — nachgewiesen mit einer Mutationsprobe, die genau diese Prüfung entfernt hat.
     */
    @Test
    fun theSameStationTwiceInOnePutIsRejected() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val fixture = !createTestMatchFixture(eventId)
        val moleId = !addTestStation(eventId, userId, TimingStationType.SPLIT)

        assertKIOFails(CompetitionTimingStationError.DuplicateStation) {
            TimingService.setCompetitionStations(
                request(moleId to 250, moleId to 3000),
                userId,
                fixture.competitionId,
                eventId,
            )
        }

        assertEquals(
            emptyList(),
            (!TimingService.getCompetitionStations(fixture.competitionId, eventId)).data,
        )
    }

    /**
     * Zwei Posten auf demselben Meter sind erlaubt (die Oberfläche warnt nur) — die Reihenfolge
     * entscheidet dann `timing_station.sorting`, nicht der Name. Die Namen stehen hier bewusst
     * gegen die Sortierung: Alphabetisch käme „A-Mole" zuerst.
     */
    @Test
    fun sameDistanceIsOrderedBySorting() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val fixture = !createTestMatchFixture(eventId)
        val moleId = !addStation(eventId, userId, name = "A-Mole", sorting = 2)
        val bridgeId = !addStation(eventId, userId, name = "B-Brücke", sorting = 1)

        !TimingService.setCompetitionStations(
            request(moleId to 1000, bridgeId to 1000),
            userId,
            fixture.competitionId,
            eventId,
        )

        val stations = (!TimingService.getCompetitionStations(fixture.competitionId, eventId)).data
        assertEquals(listOf(bridgeId, moleId), stations.map { it.timingStation })
    }

    /**
     * Eine ANZEIGE erfasst nie selbst — sie hat auf der Strecke nichts verloren, sonst entstünde
     * eine Zwischenzeit, an der am Renntag nie eine Marke ankommt. Dieselbe Grenze wie bei der
     * Zeitmarken-Erfassung, nur mit dem Fehler dieses Weges.
     */
    @Test
    fun displayStationIsRejected() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val fixture = !createTestMatchFixture(eventId)
        val displayId = !addTestStation(eventId, userId, TimingStationType.ANZEIGE)

        assertKIOFails(CompetitionTimingStationError.StationNotCapturing) {
            TimingService.setCompetitionStations(
                request(displayId to 500),
                userId,
                fixture.competitionId,
                eventId,
            )
        }

        assertEquals(
            emptyList(),
            (!TimingService.getCompetitionStations(fixture.competitionId, eventId)).data,
        )
    }

    /**
     * Der Wettkampf einer fremden Veranstaltung: Die Veranstaltung aus dem Pfad ist der einzige
     * Rahmen, in dem dieser Weg etwas findet — beim Lesen wie beim Schreiben.
     */
    @Test
    fun competitionOfAnotherEventIsRejected() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val (otherEventId, _) = !createTestEventWithAdmin()
        val fixture = !createTestMatchFixture(eventId)
        val stationId = !addTestStation(eventId, userId, TimingStationType.FINISH)

        assertKIOFails(CompetitionTimingStationError.CompetitionNotFound) {
            TimingService.getCompetitionStations(fixture.competitionId, otherEventId)
        }
        assertKIOFails(CompetitionTimingStationError.CompetitionNotFound) {
            TimingService.setCompetitionStations(
                request(stationId to 2000),
                userId,
                fixture.competitionId,
                otherEventId,
            )
        }
    }

    /** Die leere Liste ist kein Sonderweg, sondern das Ersetzen durch nichts. */
    @Test
    fun emptyListClearsTheCompetition() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val fixture = !createTestMatchFixture(eventId)
        val startId = !addTestStation(eventId, userId, TimingStationType.START)

        !TimingService.setCompetitionStations(
            request(startId to 0),
            userId,
            fixture.competitionId,
            eventId,
        )
        !TimingService.setCompetitionStations(
            request(),
            userId,
            fixture.competitionId,
            eventId,
        )

        assertEquals(
            emptyList(),
            (!TimingService.getCompetitionStations(fixture.competitionId, eventId)).data,
        )
    }
}
