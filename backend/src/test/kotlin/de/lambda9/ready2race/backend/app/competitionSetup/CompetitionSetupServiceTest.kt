package de.lambda9.ready2race.backend.app.competitionSetup

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.competition.control.CompetitionRepo
import de.lambda9.ready2race.backend.app.competitionProperties.control.CompetitionPropertiesRepo
import de.lambda9.ready2race.backend.app.competitionSetup.boundary.CompetitionSetupService
import de.lambda9.ready2race.backend.app.competitionSetup.control.CompetitionSetupMatchRepo
import de.lambda9.ready2race.backend.app.competitionSetup.control.CompetitionSetupRepo
import de.lambda9.ready2race.backend.app.competitionSetup.control.CompetitionSetupRoundRepo
import de.lambda9.ready2race.backend.app.competitionSetup.entity.CompetitionSetupMatchDto
import de.lambda9.ready2race.backend.app.competitionSetup.entity.CompetitionSetupPlacesOption
import de.lambda9.ready2race.backend.app.competitionSetup.entity.CompetitionSetupRoundDto
import de.lambda9.ready2race.backend.app.event.control.EventRepo
import de.lambda9.ready2race.backend.app.timing.boundary.TimingModeService
import de.lambda9.ready2race.backend.app.timing.createTestEventWithAdmin
import de.lambda9.ready2race.backend.app.timing.entity.TimingModeRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingStartGrouping
import de.lambda9.ready2race.backend.app.timingConfig.entity.TimingSystem
import de.lambda9.ready2race.backend.app.timingProfile.boundary.TimingProfileService
import de.lambda9.ready2race.backend.app.timingProfile.control.TimingProfileRepo
import de.lambda9.ready2race.backend.app.timingProfile.entity.TimingProfileAssignmentRequest
import de.lambda9.ready2race.backend.app.timingProfile.entity.TimingProfileKind
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionPropertiesRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionSetupMatchRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionSetupRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionSetupRoundRecord
import de.lambda9.ready2race.testing.testComprehension
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.orDie
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull

/**
 * Das Speichern eines Wettkampf-Ablaufs legt jede noch nicht gestartete Runde mit neuer Kennung
 * neu an. Die Zeitnahmeprofil-Zuordnungen hängen per Fremdschlüssel an Runde und Partie und
 * würden mit den alten Zeilen verschwinden -- das darf nicht passieren, sonst steht ein Lauf am
 * Renntag ohne Startablauf da, nur weil jemand die Bahnenzahl einer anderen Runde geändert hat.
 */
class CompetitionSetupServiceTest {

    private data class Fixture(
        val eventId: UUID,
        val userId: UUID,
        val competitionId: UUID,
        val propertiesId: UUID,
        val firstRoundId: UUID,
        val secondRoundId: UUID,
        val secondRoundMatchIds: List<UUID>,
    )

    /** Wettkampf mit zwei Runden: Vorlauf (zwei Läufe à 2 Boote) und Finale (zwei Läufe). */
    private fun seedTwoRounds(): App<Any?, Fixture> = KIO.comprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val event = (!EventRepo.get(eventId).orDie())!!
        !EventRepo.update(event) { timingSystem = TimingSystem.INTERN.name }.orDie()

        val now = LocalDateTime.now()
        val competitionId = UUID.randomUUID()
        !CompetitionRepo.create(
            CompetitionRecord(id = competitionId, event = eventId, createdAt = now, updatedAt = now)
        ).orDie()
        val propertiesId = UUID.randomUUID()
        !CompetitionPropertiesRepo.create(
            CompetitionPropertiesRecord(
                id = propertiesId,
                competition = competitionId,
                identifier = "1",
                name = "Vierer",
            )
        ).orDie()
        !CompetitionSetupRepo.create(
            CompetitionSetupRecord(competitionProperties = propertiesId, createdAt = now, updatedAt = now)
        ).orDie()

        val firstRoundId = UUID.randomUUID()
        val secondRoundId = UUID.randomUUID()
        !CompetitionSetupRoundRepo.create(
            listOf(
                CompetitionSetupRoundRecord(
                    id = secondRoundId,
                    competitionSetup = propertiesId,
                    name = "Finale",
                    required = true,
                    useDefaultSeeding = true,
                    placesOption = CompetitionSetupPlacesOption.EQUAL.name,
                    nextRound = null,
                ),
                CompetitionSetupRoundRecord(
                    id = firstRoundId,
                    competitionSetup = propertiesId,
                    name = "Vorlauf",
                    required = true,
                    useDefaultSeeding = true,
                    placesOption = CompetitionSetupPlacesOption.EQUAL.name,
                    nextRound = secondRoundId,
                ),
            )
        ).orDie()

        val secondRoundMatchIds = listOf(UUID.randomUUID(), UUID.randomUUID())
        !CompetitionSetupMatchRepo.create(
            listOf(
                CompetitionSetupMatchRecord(
                    id = UUID.randomUUID(), competitionSetupRound = firstRoundId,
                    weighting = 1, name = "Lauf 1", executionOrder = 1, teams = 2,
                ),
                CompetitionSetupMatchRecord(
                    id = UUID.randomUUID(), competitionSetupRound = firstRoundId,
                    weighting = 2, name = "Lauf 2", executionOrder = 2, teams = 2,
                ),
                CompetitionSetupMatchRecord(
                    id = secondRoundMatchIds[0], competitionSetupRound = secondRoundId,
                    weighting = 1, name = "Finale A", executionOrder = 1, teams = 2,
                ),
                CompetitionSetupMatchRecord(
                    id = secondRoundMatchIds[1], competitionSetupRound = secondRoundId,
                    weighting = 2, name = "Finale B", executionOrder = 2, teams = 2,
                ),
            )
        ).orDie()

        KIO.ok(Fixture(eventId, userId, competitionId, propertiesId, firstRoundId, secondRoundId, secondRoundMatchIds))
    }

    private fun addMode(eventId: UUID, userId: UUID, name: String): App<Any?, UUID> = KIO.comprehension {
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

    private fun assign(
        f: Fixture,
        round: UUID?,
        match: UUID?,
        profile: UUID,
    ) = TimingProfileService.upsertAssignment(
        f.eventId,
        f.userId,
        TimingProfileAssignmentRequest(
            competition = f.competitionId,
            competitionSetupRound = round,
            competitionSetupMatch = match,
            profile = profile,
        ),
    )

    private fun match(weighting: Int, name: String, teams: Int) = CompetitionSetupMatchDto(
        weighting = weighting,
        teams = teams,
        name = name,
        participants = List(teams) { it + 1 + (weighting - 1) * teams },
        executionOrder = weighting,
        startTimeOffset = null,
    )

    private fun round(id: UUID?, name: String, matches: List<CompetitionSetupMatchDto>) = CompetitionSetupRoundDto(
        id = id,
        name = name,
        required = true,
        matches = matches,
        groups = null,
        statisticEvaluations = null,
        useDefaultSeeding = true,
        placesOption = CompetitionSetupPlacesOption.EQUAL,
        places = null,
        matchNamings = null,
    )

    @Test
    fun `Runden- und Partie-Zuordnung wandern beim Speichern auf die neuen Kennungen`() = testComprehension {
        val f = !seedTwoRounds()
        val roundMode = !addMode(f.eventId, f.userId, "Massenstart")
        val matchMode = !addMode(f.eventId, f.userId, "Timetrial 30s")
        !assign(f, round = f.secondRoundId, match = null, profile = roundMode)
        !assign(f, round = f.secondRoundId, match = f.secondRoundMatchIds[1], profile = matchMode)

        // Erneut speichern: nur der Vorlauf bekommt breitere Läufe, das Finale bleibt wie es war.
        !CompetitionSetupService.updateCompetitionSetupRounds(
            listOf(
                round(f.firstRoundId, "Vorlauf", listOf(match(1, "Lauf 1", 3), match(2, "Lauf 2", 3))),
                round(f.secondRoundId, "Finale", listOf(match(1, "Finale A", 2), match(2, "Finale B", 2))),
            ),
            f.propertiesId,
            null,
        )

        val rounds = !CompetitionSetupRoundRepo.getBySetupId(f.propertiesId).orDie()
        val newFinale = rounds.single { it.name == "Finale" }
        assertNotEquals(f.secondRoundId, newFinale.id, "Die Runde wurde neu angelegt")
        val newFinaleMatches = !CompetitionSetupMatchRepo.get(listOf(newFinale.id)).orDie()
        val newFinaleB = newFinaleMatches.single { it.weighting == 2 }

        val assignments = !TimingProfileRepo.getAssignments(f.eventId, TimingProfileKind.MODE).orDie()
        val roundRow = assignments.singleOrNull { it.round == newFinale.id && it.match == null }
        assertNotNull(roundRow, "Die Runden-Zuordnung ist auf die neue Runde gewandert")
        assertEquals(roundMode, roundRow.profile)
        val matchRow = assignments.singleOrNull { it.match == newFinaleB.id }
        assertNotNull(matchRow, "Die Partie-Zuordnung ist auf die neue Partie gewandert")
        assertEquals(matchMode, matchRow.profile)
        assertEquals(newFinale.id, matchRow.round)
        assertEquals(2, assignments.size)
    }

    @Test
    fun `eine Zuordnung ohne Gegenstück im neuen Ablauf wird verworfen`() = testComprehension {
        val f = !seedTwoRounds()
        val modeA = !addMode(f.eventId, f.userId, "Massenstart")
        val modeB = !addMode(f.eventId, f.userId, "Timetrial 30s")
        !assign(f, round = f.secondRoundId, match = f.secondRoundMatchIds[0], profile = modeA)
        !assign(f, round = f.secondRoundId, match = f.secondRoundMatchIds[1], profile = modeB)

        // Das Finale hat jetzt nur noch einen Lauf: Finale B gibt es nicht mehr.
        !CompetitionSetupService.updateCompetitionSetupRounds(
            listOf(
                round(f.firstRoundId, "Vorlauf", listOf(match(1, "Lauf 1", 2), match(2, "Lauf 2", 2))),
                round(f.secondRoundId, "Finale", listOf(match(1, "Finale A", 2))),
            ),
            f.propertiesId,
            null,
        )

        val newFinale = (!CompetitionSetupRoundRepo.getBySetupId(f.propertiesId).orDie()).single { it.name == "Finale" }
        val newFinaleA = (!CompetitionSetupMatchRepo.get(listOf(newFinale.id)).orDie()).single()

        val assignments = !TimingProfileRepo.getAssignments(f.eventId, TimingProfileKind.MODE).orDie()
        assertEquals(1, assignments.size, "Nur Finale A behält seine Zuordnung: $assignments")
        assertEquals(newFinaleA.id, assignments.single().match)
        assertEquals(modeA, assignments.single().profile)
    }
}
