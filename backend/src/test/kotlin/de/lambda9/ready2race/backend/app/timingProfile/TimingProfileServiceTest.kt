package de.lambda9.ready2race.backend.app.timingProfile

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.event.control.EventRepo
import de.lambda9.ready2race.backend.app.timing.boundary.TimingModeService
import de.lambda9.ready2race.backend.app.timing.createTestEventWithAdmin
import de.lambda9.ready2race.backend.app.timing.createTestMatchFixture
import de.lambda9.ready2race.backend.app.timing.entity.TimingModeRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingStartGrouping
import de.lambda9.ready2race.backend.app.timingConfig.entity.TimingSystem
import de.lambda9.ready2race.backend.app.timingProfile.boundary.TimingProfileService
import de.lambda9.ready2race.backend.app.timingProfile.entity.TimingProfileAssignmentRequest
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_MATCH
import de.lambda9.ready2race.backend.database.delete
import de.lambda9.ready2race.backend.app.timingProfile.entity.TimingProfileError
import de.lambda9.ready2race.backend.app.timingProfile.entity.TimingProfileKind
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.database.generated.tables.records.RaceclockerRaceRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.RACECLOCKER_RACE
import de.lambda9.ready2race.backend.database.insert
import de.lambda9.ready2race.testing.testComprehension
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.orDie
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * Der Zeitnahmeprofil-Baum gegen echtes Postgres: Vererbung über vier Ebenen, die Abwehr von
 * Profilen der falschen Art oder fremder Veranstaltungen und das Bereinigen der Ebenen darunter.
 */
class TimingProfileServiceTest {

    private fun setEventTimingSystem(eventId: UUID, system: TimingSystem?): App<Any?, Unit> =
        KIO.comprehension {
            val event = (!EventRepo.get(eventId).orDie())!!
            !EventRepo.update(event) { timingSystem = system?.name }.orDie()
            KIO.ok(Unit)
        }

    private fun addMode(eventId: UUID, userId: UUID, name: String): App<Any?, UUID> =
        KIO.comprehension {
            val response = !TimingModeService.addMode(
                TimingModeRequest(
                    name = name,
                    startGrouping = TimingStartGrouping.EINZEL,
                    intervalSeconds = 30,
                    leadInSeconds = 10,
                ),
                userId,
                eventId,
            )
            KIO.ok((response as ApiResponse.Created).id)
        }

    // Direkt eingefügt statt über RaceClockerRaceService: der Dienst normalisiert die Adresse
    // gegen eine Host-Allowlist, und für diesen Test zählt allein, dass die Zeile existiert.
    private fun addRace(eventId: UUID, userId: UUID): App<Any?, UUID> = KIO.comprehension {
        val raceId = UUID.randomUUID()
        val now = LocalDateTime.now()
        !RACECLOCKER_RACE.insert(
            RaceclockerRaceRecord(
                id = raceId,
                event = eventId,
                name = "Rennen-${UUID.randomUUID()}",
                resultsUrl = "https://www.raceclocker.com/${UUID.randomUUID()}",
                capturesLaps = false,
                position = 1,
                createdAt = now,
                createdBy = userId,
                updatedAt = now,
                updatedBy = userId,
            )
        ).orDie()
        KIO.ok(raceId)
    }

    private fun upsert(
        eventId: UUID,
        userId: UUID,
        competition: UUID? = null,
        round: UUID? = null,
        match: UUID? = null,
        profile: UUID?,
    ) = TimingProfileService.upsertAssignment(
        eventId,
        userId,
        TimingProfileAssignmentRequest(
            competition = competition,
            competitionSetupRound = round,
            competitionSetupMatch = match,
            profile = profile,
        ),
    )

    /**
     * Eine in der Durchführung neu erzeugte Runde behält die Profile ihrer Partien.
     *
     * Der Grund ist die Ebene, an der die Zuordnung hängt: `competition_setup_match` ist der
     * ABLAUF, `competition_match` die DURCHFÜHRUNG. `deleteCurrentRound` löscht nur letztere --
     * die Setup-Partien behalten ihre Kennungen, und die Zuordnung findet ihren Lauf wieder.
     *
     * Der Test löscht deshalb genau die Durchführungs-Zeile und prüft, dass die Zuordnung steht.
     * Ohne ihn wäre das Verhalten Zufall: Ein `on delete cascade` eine Ebene tiefer würde es
     * stillschweigend kippen, und gemerkt hätte man es erst am Renntag an einem Lauf, der plötzlich
     * ohne Zeitnahmetyp dasteht.
     */
    @Test
    fun `eine neu erzeugte Runde behält die Profile ihrer Partien`() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !setEventTimingSystem(eventId, TimingSystem.INTERN)
        val fixture = !createTestMatchFixture(eventId)
        val modeId = !addMode(eventId, userId, "Timetrial 30s")

        !upsert(
            eventId,
            userId,
            competition = fixture.competitionId,
            round = fixture.roundId,
            match = fixture.setupMatchId,
            profile = modeId,
        )

        // Genau das, was das Löschen einer Runde in der Durchführung tut: die
        // Durchführungs-Zeile geht, die Setup-Partie bleibt.
        val geloescht = !COMPETITION_MATCH.delete { COMPETITION_SETUP_MATCH.eq(fixture.setupMatchId) }.orDie()
        // Ohne diese Zusicherung bewiese der Test nichts: Haette die Fixture gar keine
        // Durchfuehrungs-Zeile, waere das Loeschen ein Nichts und die Zuordnung trivial am Leben.
        assertEquals(1, geloescht)

        val match = (!TimingProfileService.getTree(eventId)).dto
            .competitions.single()
            .rounds.single()
            .matches.single()
        assertEquals(modeId, match.ownProfile)
        assertEquals(modeId, match.effectiveProfile)
    }

    @Test
    fun `setzt und räumt eine Wettkampf-Zuordnung ab`() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !setEventTimingSystem(eventId, TimingSystem.INTERN)
        val fixture = !createTestMatchFixture(eventId)
        val modeId = !addMode(eventId, userId, "Timetrial 30s")

        !upsert(eventId, userId, competition = fixture.competitionId, profile = modeId)

        val tree = (!TimingProfileService.getTree(eventId)).dto
        assertEquals(TimingProfileKind.MODE, tree.kind)
        assertEquals(listOf(modeId), tree.options.map { it.id })
        assertEquals("Intervall 30 s", tree.options.first().detail)
        val competition = tree.competitions.single()
        assertEquals(modeId, competition.ownProfile)
        assertEquals(modeId, competition.effectiveProfile)

        !upsert(eventId, userId, competition = fixture.competitionId, profile = null)

        val cleared = (!TimingProfileService.getTree(eventId)).dto.competitions.single()
        assertNull(cleared.ownProfile)
        assertNull(cleared.effectiveProfile)
    }

    @Test
    fun `die Partie schlägt den Wettkampf im Baum`() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !setEventTimingSystem(eventId, TimingSystem.INTERN)
        val fixture = !createTestMatchFixture(eventId)
        val competitionMode = !addMode(eventId, userId, "Wellenstart")
        val matchMode = !addMode(eventId, userId, "Timetrial 30s")

        !upsert(eventId, userId, competition = fixture.competitionId, profile = competitionMode)
        !upsert(
            eventId,
            userId,
            competition = fixture.competitionId,
            round = fixture.roundId,
            match = fixture.setupMatchId,
            profile = matchMode,
        )

        val competition = (!TimingProfileService.getTree(eventId)).dto.competitions.single()
        val round = competition.rounds.single()
        val match = round.matches.single()

        assertEquals(competitionMode, competition.effectiveProfile)
        assertEquals(competitionMode, round.effectiveProfile)
        assertNull(round.ownProfile)
        assertEquals(matchMode, match.ownProfile)
        assertEquals(matchMode, match.effectiveProfile)
        // Ohne eigenen Namen heißt der Lauf nach seiner Position in der Runde.
        assertEquals("Lauf 1", match.name)
    }

    @Test
    fun `die Wurzel vererbt an Wettkämpfe ohne eigenen Wert`() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !setEventTimingSystem(eventId, TimingSystem.INTERN)
        val fixture = !createTestMatchFixture(eventId)
        val modeId = !addMode(eventId, userId, "Massenstart")

        !upsert(eventId, userId, profile = modeId)

        val tree = (!TimingProfileService.getTree(eventId)).dto
        assertEquals(modeId, tree.ownProfile)
        val competition = tree.competitions.single()
        assertNull(competition.ownProfile)
        assertEquals(modeId, competition.effectiveProfile)
        assertEquals(modeId, competition.rounds.single().effectiveProfile)
        assertEquals(modeId, competition.rounds.single().matches.single().effectiveProfile)
        assertEquals(fixture.setupMatchId, competition.rounds.single().matches.single().matchId)
    }

    @Test
    fun `ein Rennen an einer intern gezeiteten Veranstaltung wird abgelehnt`() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !setEventTimingSystem(eventId, TimingSystem.INTERN)
        val fixture = !createTestMatchFixture(eventId)
        val raceId = !addRace(eventId, userId)

        assertKIOFails(TimingProfileError.KindMismatch) {
            upsert(eventId, userId, competition = fixture.competitionId, profile = raceId)
        }
    }

    @Test
    fun `ein Profil einer fremden Veranstaltung wird abgelehnt`() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !setEventTimingSystem(eventId, TimingSystem.INTERN)
        val fixture = !createTestMatchFixture(eventId)

        val (otherEventId, otherUserId) = !createTestEventWithAdmin()
        !setEventTimingSystem(otherEventId, TimingSystem.INTERN)
        val foreignMode = !addMode(otherEventId, otherUserId, "Fremder Typ")

        assertKIOFails(TimingProfileError.ProfileNotFound) {
            upsert(eventId, userId, competition = fixture.competitionId, profile = foreignMode)
        }
    }

    @Test
    fun `eine Partie ohne Runde im Pfad wird abgelehnt`() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !setEventTimingSystem(eventId, TimingSystem.INTERN)
        val fixture = !createTestMatchFixture(eventId)
        val modeId = !addMode(eventId, userId, "Timetrial 30s")

        assertKIOFails(TimingProfileError.ScopeInvalid) {
            upsert(
                eventId,
                userId,
                competition = fixture.competitionId,
                match = fixture.setupMatchId,
                profile = modeId,
            )
        }
    }

    /**
     * Der Zuschnitt auf die geltende Art sitzt in `TimingProfileRepo.getAssignments`. Ohne ihn
     * meldete der Baum ein Profil, das an dieser Veranstaltung gar nicht wählbar ist — genau die
     * Lage, die die Übernahme des Altbestands (V202608242100) hinterlässt, wenn eine Veranstaltung
     * ihr System wechselt.
     */
    @Test
    fun `eine Zuordnung der anderen Art zählt nicht`() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !setEventTimingSystem(eventId, TimingSystem.INTERN)
        val fixture = !createTestMatchFixture(eventId)
        val modeId = !addMode(eventId, userId, "Timetrial 30s")
        !upsert(eventId, userId, competition = fixture.competitionId, profile = modeId)

        // Umstellung auf RaceClocker: die Zeitnahmetyp-Zeile bleibt in der Datenbank stehen.
        !setEventTimingSystem(eventId, TimingSystem.RACECLOCKER)
        val raceId = !addRace(eventId, userId)

        val tree = (!TimingProfileService.getTree(eventId)).dto
        assertEquals(TimingProfileKind.RACE, tree.kind)
        assertEquals(listOf(raceId), tree.options.map { it.id })
        val competition = tree.competitions.single()
        assertNull(competition.ownProfile)
        assertNull(competition.effectiveProfile)
        assertNull(competition.rounds.single().matches.single().effectiveProfile)
    }

    /**
     * Die drei Zugehörigkeitsprüfungen sind die Sperre gegen Schreibzugriffe über
     * Veranstaltungsgrenzen hinweg: Die Fremdschlüssel allein erlauben jede dieser drei
     * Vertauschungen, fachlich ergäbe keine davon eine auflösbare Zuordnung.
     */
    @Test
    fun `ein Pfad aus einer fremden Veranstaltung wird abgelehnt`() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !setEventTimingSystem(eventId, TimingSystem.INTERN)
        val eigen = !createTestMatchFixture(eventId)
        val modeId = !addMode(eventId, userId, "Timetrial 30s")

        val (otherEventId, _) = !createTestEventWithAdmin()
        val fremd = !createTestMatchFixture(otherEventId)

        // Der Wettkampf gehört einer anderen Veranstaltung.
        assertKIOFails(TimingProfileError.ScopeInvalid) {
            upsert(eventId, userId, competition = fremd.competitionId, profile = modeId)
        }

        // Der Wettkampf stimmt, die Runde gehört zu einem anderen.
        assertKIOFails(TimingProfileError.ScopeInvalid) {
            upsert(
                eventId,
                userId,
                competition = eigen.competitionId,
                round = fremd.roundId,
                profile = modeId,
            )
        }

        // Wettkampf und Runde stimmen, die Partie gehört zu einer anderen Runde.
        assertKIOFails(TimingProfileError.ScopeInvalid) {
            upsert(
                eventId,
                userId,
                competition = eigen.competitionId,
                round = eigen.roundId,
                match = fremd.setupMatchId,
                profile = modeId,
            )
        }
    }

    @Test
    fun `bereinigen eines fremden Wettkampfs wird abgelehnt`() = testComprehension {
        val (eventId, _) = !createTestEventWithAdmin()
        !setEventTimingSystem(eventId, TimingSystem.INTERN)

        val (otherEventId, _) = !createTestEventWithAdmin()
        val fremd = !createTestMatchFixture(otherEventId)

        // Ohne die Prüfung bliebe es bei einem stillen 204 - gelöscht würde ohnehin nichts.
        assertKIOFails(TimingProfileError.ScopeInvalid) {
            TimingProfileService.resetAssignments(eventId, fremd.competitionId)
        }
    }

    @Test
    fun `bereinigen räumt genau die Ebenen darunter ab`() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !setEventTimingSystem(eventId, TimingSystem.INTERN)
        val fixture = !createTestMatchFixture(eventId)
        val rootMode = !addMode(eventId, userId, "Massenstart")
        val competitionMode = !addMode(eventId, userId, "Wellenstart")
        val roundMode = !addMode(eventId, userId, "Timetrial 30s")
        val matchMode = !addMode(eventId, userId, "Timetrial 60s")

        val setAllFourLevels: App<Any?, Unit> = KIO.comprehension {
            !upsert(eventId, userId, profile = rootMode)
            !upsert(eventId, userId, competition = fixture.competitionId, profile = competitionMode)
            !upsert(
                eventId,
                userId,
                competition = fixture.competitionId,
                round = fixture.roundId,
                profile = roundMode,
            )
            !upsert(
                eventId,
                userId,
                competition = fixture.competitionId,
                round = fixture.roundId,
                match = fixture.setupMatchId,
                profile = matchMode,
            )
            KIO.ok(Unit)
        }

        !setAllFourLevels
        !TimingProfileService.resetAssignments(eventId, null)

        val whole = (!TimingProfileService.getTree(eventId)).dto
        assertEquals(rootMode, whole.ownProfile)
        val afterWholeReset = whole.competitions.single()
        assertNull(afterWholeReset.ownProfile)
        assertNull(afterWholeReset.rounds.single().ownProfile)
        assertNull(afterWholeReset.rounds.single().matches.single().ownProfile)
        // Erben statt leer: der Wurzelwert gilt jetzt bis nach unten durch.
        assertEquals(rootMode, afterWholeReset.rounds.single().matches.single().effectiveProfile)

        !setAllFourLevels
        !TimingProfileService.resetAssignments(eventId, fixture.competitionId)

        val scoped = (!TimingProfileService.getTree(eventId)).dto
        assertEquals(rootMode, scoped.ownProfile)
        val afterScopedReset = scoped.competitions.single()
        assertEquals(competitionMode, afterScopedReset.ownProfile)
        assertNull(afterScopedReset.rounds.single().ownProfile)
        assertNull(afterScopedReset.rounds.single().matches.single().ownProfile)
        assertEquals(competitionMode, afterScopedReset.rounds.single().matches.single().effectiveProfile)
    }
}
