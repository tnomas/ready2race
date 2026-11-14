package de.lambda9.ready2race.backend.app.material

import de.lambda9.ready2race.backend.app.JEnv
import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.competitionExecution.control.CompetitionMatchRepo
import de.lambda9.ready2race.backend.app.competitionExecution.control.CompetitionMatchTeamRepo
import de.lambda9.ready2race.backend.app.competitionProperties.control.CompetitionPropertiesHasMaterialTypeRepo
import de.lambda9.ready2race.backend.app.eventRegistration.boundary.EventRegistrationService
import de.lambda9.ready2race.backend.app.liveDashboard.control.LiveDashboardRepo
import de.lambda9.ready2race.backend.app.material.boundary.MaterialService
import de.lambda9.ready2race.backend.app.material.control.MaterialRequestRepo
import de.lambda9.ready2race.backend.app.material.entity.MaterialAssignmentEntry
import de.lambda9.ready2race.backend.app.material.entity.MaterialAssignmentsRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialCategory
import de.lambda9.ready2race.backend.app.material.entity.MaterialDecisionRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialItemRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialItemStatus
import de.lambda9.ready2race.backend.app.material.entity.MaterialOfferRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialRequestStatus
import de.lambda9.ready2race.backend.app.material.entity.MaterialTypeRequest
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionMatchRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionMatchTeamRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionPropertiesHasMaterialTypeRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionSetupMatchRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_MATCH
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_MATCH_TEAM
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_REGISTRATION
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_SETUP_MATCH
import de.lambda9.ready2race.backend.database.generated.tables.references.EFFECTIVE_MATERIAL_FOR_MATCH_TEAM
import de.lambda9.ready2race.backend.database.generated.tables.references.MATERIAL_REQUEST_VIEW
import de.lambda9.ready2race.backend.database.insert
import de.lambda9.ready2race.backend.database.select
import de.lambda9.ready2race.backend.database.update
import de.lambda9.ready2race.testing.kio.TestComprehensionScope
import de.lambda9.ready2race.testing.testComprehension
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Sicht `effective_material_for_match_team` (Task 6.1): Grundzuteilung sichtbar, Ausnahme je Lauf
 * schlägt sie, `deviates_from_start_number` folgt der Bootsnummer, und Kategorie OTHER erreicht
 * die Sicht nie - sie bleibt Mein Event und dem Anbieter-Dashboard vorbehalten (Spec Abschnitt 11).
 * Nutzt [seedOpenTeamEvent]/[seedMatch] aus `MaterialRegistrationFixture.kt` (Task 3.0/4.1); ein
 * zweiter Lauf im selben Wettkampf-Setup kommt aus [seedSecondMatch] hier, weil `competition_setup`
 * pro Wettkampf-Eigenschaften nur einmal angelegt werden darf.
 */
class EffectiveMaterialViewTest {

    /**
     * Runde, Lauf und Lauf-Team wie in [seedMatch], aber ohne ein zweites `competition_setup` -
     * dessen Primärschlüssel ist `competition_properties`, ein zweiter Aufruf von [seedMatch] für
     * denselben Wettkampf würde also gegen den bestehenden Datensatz laufen.
     */
    private fun TestComprehensionScope<JEnv>.seedSecondMatch(
        roundId: UUID,
        registrationId: UUID,
        startNumber: Int,
    ): SeededMatch {
        val matchId = UUID.randomUUID()
        !COMPETITION_SETUP_MATCH.insert(
            CompetitionSetupMatchRecord(
                id = matchId,
                competitionSetupRound = roundId,
                weighting = 1,
                name = "Lauf 2",
                executionOrder = 2,
                teams = 1,
            )
        )
        !COMPETITION_MATCH.insert(
            CompetitionMatchRecord(
                competitionSetupMatch = matchId,
                startTime = seedTime,
                createdAt = seedTime,
                updatedAt = seedTime,
            )
        )
        !COMPETITION_MATCH_TEAM.insert(
            CompetitionMatchTeamRecord(
                id = UUID.randomUUID(),
                competitionMatch = matchId,
                competitionRegistration = registrationId,
                startNumber = startNumber,
                createdAt = seedTime,
                updatedAt = seedTime,
            )
        )
        return SeededMatch(roundId = roundId, matchId = matchId)
    }

    @Test
    fun baseAssignmentVisibleExceptionWinsDeviatesAndOtherNeverAppears() = testComprehension {
        val seeded = seedOpenTeamEvent()
        val teamId = UUID.randomUUID()
        val dto = upsertDto(
            seeded,
            listOf(teamDto(teamId, seeded.namedParticipantId, listOf(seeded.participant1, seeded.participant2))),
        )
        !EventRegistrationService.upsertRegistrationForEvent(seeded.eventId, dto, seeded.user)

        // Meldungsnummer bewusst ungleich jeder Bootsnummer: die Abweichung richtet sich nach
        // der Startnummer im Lauf (unten 7 in beiden Läufen), nicht nach team_number.
        !COMPETITION_REGISTRATION.update({ teamNumber = 2 }) { ID.eq(teamId) }

        val userId = !createTestUser()
        val providerId = (!MaterialService.addProvider(provider(), userId) as ApiResponse.Created).id
        val typeBoat =
            (!MaterialService.addType(MaterialTypeRequest("C4x+", MaterialCategory.BOAT, null), userId) as ApiResponse.Created).id
        val typeOars =
            (!MaterialService.addType(MaterialTypeRequest("Skulls", MaterialCategory.OTHER, null), userId) as ApiResponse.Created).id

        // Bedarf am Wettkampf für beide Arten - ohne ihn lehnt setRequestsForRegistration die
        // Anfrage mit TypeNotDemanded ab (Prüfung gegen competition_properties_has_material_type).
        !CompetitionPropertiesHasMaterialTypeRepo.create(
            listOf(
                CompetitionPropertiesHasMaterialTypeRecord(
                    competitionProperties = seeded.propertiesId,
                    materialType = typeBoat,
                    count = 1,
                ),
                CompetitionPropertiesHasMaterialTypeRecord(
                    competitionProperties = seeded.propertiesId,
                    materialType = typeOars,
                    count = 1,
                ),
            )
        )

        !MaterialService.inviteProvider(seeded.eventId, providerId, userId)
        val offerBoat = (
            !MaterialService.addOffer(seeded.eventId, providerId, MaterialOfferRequest(typeBoat, "45 €", 5, 30), userId)
                as ApiResponse.Created
            ).id
        val offerOars = (
            !MaterialService.addOffer(seeded.eventId, providerId, MaterialOfferRequest(typeOars, null, 5, 30), userId)
                as ApiResponse.Created
            ).id

        val itemBase = (
            !MaterialService.addItem(providerId, MaterialItemRequest(typeBoat, 7, "Boot 7", null, MaterialItemStatus.ACTIVE), userId)
                as ApiResponse.Created
            ).id
        val itemException = (
            !MaterialService.addItem(providerId, MaterialItemRequest(typeBoat, 3, "Boot 3", null, MaterialItemStatus.ACTIVE), userId)
                as ApiResponse.Created
            ).id
        val itemOars = (
            !MaterialService.addItem(providerId, MaterialItemRequest(typeOars, null, "Skulls A", null, MaterialItemStatus.ACTIVE), userId)
                as ApiResponse.Created
            ).id

        !MaterialService.setRequestsForRegistration(
            seeded.eventId, teamId, Privilege.Scope.GLOBAL to null, listOf(offerBoat, offerOars), userId,
        )
        val requests = !MaterialRequestRepo.forRegistration(teamId)
        val requestBoat = requests.single { it.materialOffer == offerBoat }
        val requestOars = requests.single { it.materialOffer == offerOars }

        !MaterialService.decideRequest(
            seeded.eventId, providerId, requestBoat.id, MaterialDecisionRequest(MaterialRequestStatus.CONFIRMED, null), userId,
        )
        !MaterialService.decideRequest(
            seeded.eventId, providerId, requestOars.id, MaterialDecisionRequest(MaterialRequestStatus.CONFIRMED, null), userId,
        )

        val match1 = seedMatch(seeded.propertiesId, teamId, startNumber = 7)
        val match2 = seedSecondMatch(match1.roundId, teamId, startNumber = 7)

        // Grundzuteilung fürs Boot, Ausnahme für match2 - beides in derselben Anfrage, denn
        // setAssignments ersetzt die Liste je Anfrage immer vollständig.
        !MaterialService.setAssignments(
            seeded.eventId, providerId, requestBoat.id,
            MaterialAssignmentsRequest(
                listOf(
                    MaterialAssignmentEntry(itemBase, null),
                    MaterialAssignmentEntry(itemException, match2.matchId),
                )
            ),
            userId,
        )
        // Zubehör (OTHER) ist ebenfalls bestätigt und zugeteilt - darf die Sicht trotzdem nie
        // erreichen (Spec Abschnitt 11).
        !MaterialService.setAssignments(
            seeded.eventId, providerId, requestOars.id,
            MaterialAssignmentsRequest(listOf(MaterialAssignmentEntry(itemOars, null))),
            userId,
        )

        val matchTeam1 = (!CompetitionMatchTeamRepo.getByMatchAndRegistrationId(match1.matchId, teamId))!!
        val matchTeam2 = (!CompetitionMatchTeamRepo.getByMatchAndRegistrationId(match2.matchId, teamId))!!

        val rowsMatch1 = !EFFECTIVE_MATERIAL_FOR_MATCH_TEAM.select { COMPETITION_MATCH_TEAM.eq(matchTeam1.id) }
        val rowsMatch2 = !EFFECTIVE_MATERIAL_FOR_MATCH_TEAM.select { COMPETITION_MATCH_TEAM.eq(matchTeam2.id) }

        // match1 hat keine Ausnahme - die Grundzuteilung gilt, die Nummer stimmt mit der
        // Startnummer im Lauf überein (die Meldungsnummer 2 spielt keine Rolle).
        assertEquals(1, rowsMatch1.size)
        val row1 = rowsMatch1.single()
        assertEquals(itemBase, row1.materialItem)
        assertEquals(7, row1.number)
        assertEquals("Boot 7", row1.label)
        assertEquals(MaterialCategory.BOAT.name, row1.category)
        assertEquals(false, row1.deviatesFromStartNumber)

        // match2 hat eine Ausnahme - sie schlägt die Grundzuteilung, und die Nummer weicht von
        // der Startnummer im Lauf ab.
        assertEquals(1, rowsMatch2.size)
        val row2 = rowsMatch2.single()
        assertEquals(itemException, row2.materialItem)
        assertEquals(3, row2.number)
        assertEquals("Boot 3", row2.label)
        assertTrue(row2.deviatesFromStartNumber == true)

        // DTO-Pfad: LiveDashboardRepo.getTeams liefert dasselbe wirksame Materialstück mit.
        val liveRows = !LiveDashboardRepo.getTeams(seeded.eventId, match2.matchId)
        assertTrue(liveRows.isNotEmpty())
        val liveFirst = liveRows.first()
        assertEquals("Boot 3", liveFirst.get("material_label", String::class.java))
        assertEquals(3, liveFirst.get("material_number", Int::class.java))
        assertEquals(true, liveFirst.get("material_deviates", Boolean::class.java))
        assertEquals(MaterialCategory.BOAT.name, liveFirst.get("material_category", String::class.java))
    }

    /**
     * Finding I-1 (Review 2026-09-07): zwei BOAT-Bedarfe am selben Wettkampf, zwei bestätigte
     * Anfragen mit je einer Grundzuteilung - vorher lieferte die Sicht zwei Zeilen je Lauf-Team
     * und `startlist_team` (gruppiert nach den `emf.*`-Spalten) listete das Team doppelt.
     */
    @Test
    fun twoBoatDemandsStillYieldOneRowPerMatchTeam() = testComprehension {
        val seeded = seedOpenTeamEvent()
        val teamId = UUID.randomUUID()
        val dto = upsertDto(
            seeded,
            listOf(teamDto(teamId, seeded.namedParticipantId, listOf(seeded.participant1, seeded.participant2))),
        )
        !EventRegistrationService.upsertRegistrationForEvent(seeded.eventId, dto, seeded.user)

        val userId = !createTestUser()
        val providerId = (!MaterialService.addProvider(provider(), userId) as ApiResponse.Created).id

        // Zwei Materialarten, beide Kategorie BOAT - der Primärschlüssel von
        // competition_properties_has_material_type ist (properties, type), zwei BOAT-Bedarfe am
        // selben Wettkampf sind also erlaubt (Finding I-1).
        val typeBoatA =
            (!MaterialService.addType(MaterialTypeRequest("C4x+", MaterialCategory.BOAT, null), userId) as ApiResponse.Created).id
        val typeBoatB =
            (!MaterialService.addType(MaterialTypeRequest("Skiff", MaterialCategory.BOAT, null), userId) as ApiResponse.Created).id

        !CompetitionPropertiesHasMaterialTypeRepo.create(
            listOf(
                CompetitionPropertiesHasMaterialTypeRecord(
                    competitionProperties = seeded.propertiesId,
                    materialType = typeBoatA,
                    count = 1,
                ),
                CompetitionPropertiesHasMaterialTypeRecord(
                    competitionProperties = seeded.propertiesId,
                    materialType = typeBoatB,
                    count = 1,
                ),
            )
        )

        !MaterialService.inviteProvider(seeded.eventId, providerId, userId)
        val offerA = (
            !MaterialService.addOffer(seeded.eventId, providerId, MaterialOfferRequest(typeBoatA, "45 €", 5, 30), userId)
                as ApiResponse.Created
            ).id
        val offerB = (
            !MaterialService.addOffer(seeded.eventId, providerId, MaterialOfferRequest(typeBoatB, "30 €", 5, 30), userId)
                as ApiResponse.Created
            ).id

        val itemA = (
            !MaterialService.addItem(providerId, MaterialItemRequest(typeBoatA, 7, "Boot 7", null, MaterialItemStatus.ACTIVE), userId)
                as ApiResponse.Created
            ).id
        val itemB = (
            !MaterialService.addItem(providerId, MaterialItemRequest(typeBoatB, 9, "Skiff 9", null, MaterialItemStatus.ACTIVE), userId)
                as ApiResponse.Created
            ).id

        !MaterialService.setRequestsForRegistration(
            seeded.eventId, teamId, Privilege.Scope.GLOBAL to null, listOf(offerA, offerB), userId,
        )
        val requests = !MaterialRequestRepo.forRegistration(teamId)
        val requestA = requests.single { it.materialOffer == offerA }
        val requestB = requests.single { it.materialOffer == offerB }

        !MaterialService.decideRequest(
            seeded.eventId, providerId, requestA.id, MaterialDecisionRequest(MaterialRequestStatus.CONFIRMED, null), userId,
        )
        !MaterialService.decideRequest(
            seeded.eventId, providerId, requestB.id, MaterialDecisionRequest(MaterialRequestStatus.CONFIRMED, null), userId,
        )

        // Beide Anfragen bekommen je eine Grundzuteilung (kein Lauf-Bezug) - genau die Lage, in
        // der die alte Sicht zwei Zeilen je Lauf-Team lieferte.
        !MaterialService.setAssignments(
            seeded.eventId, providerId, requestA.id,
            MaterialAssignmentsRequest(listOf(MaterialAssignmentEntry(itemA, null))),
            userId,
        )
        !MaterialService.setAssignments(
            seeded.eventId, providerId, requestB.id,
            MaterialAssignmentsRequest(listOf(MaterialAssignmentEntry(itemB, null))),
            userId,
        )

        val match = seedMatch(seeded.propertiesId, teamId, startNumber = 1)
        val matchTeam = (!CompetitionMatchTeamRepo.getByMatchAndRegistrationId(match.matchId, teamId))!!

        val rows = !EFFECTIVE_MATERIAL_FOR_MATCH_TEAM.select { COMPETITION_MATCH_TEAM.eq(matchTeam.id) }
        assertEquals(1, rows.size, "genau eine Zeile je Lauf-Team, auch bei zwei bestätigten BOAT-Anfragen")

        // startlist_team gruppiert nach den emf.*-Spalten - fächerte die Sicht vorher auf, listete
        // die PDF/CSV-Startliste das Team zweimal.
        val startlist = (!CompetitionMatchRepo.getForStartList(match.matchId))!!
        val teamEntries = startlist.teams?.filterNotNull().orEmpty().filter { it.teamId == matchTeam.competitionRegistration }
        assertEquals(1, teamEntries.size, "die Startliste darf das Team nur einmal listen")
    }

    /**
     * Startnummer-Semantik (Befund Lücke 7): Die Abweichung vergleicht die Bootsnummer mit der
     * Startnummer im Lauf (`competition_match_team.start_number`), die jede Anzeige neben dem Boot
     * zeigt - eine gleiche Meldungsnummer (`team_number`) hebt die Abweichung nicht auf. Die
     * Anfrage-Sicht liefert dieselbe Zahl als `start_number` (erster Lauf), ohne Lauf die
     * Meldungsnummer.
     */
    @Test
    fun deviationFollowsTheStartNumberInTheMatchNotTheTeamNumber() = testComprehension {
        val seeded = seedOpenTeamEvent()
        val teamId = UUID.randomUUID()
        !EventRegistrationService.upsertRegistrationForEvent(
            seeded.eventId,
            upsertDto(seeded, listOf(teamDto(teamId, seeded.namedParticipantId, listOf(seeded.participant1, seeded.participant2)))),
            seeded.user,
        )
        // Meldungsnummer = Bootsnummer, wie sie "Startnummern nach Bootsnummern" setzt.
        !COMPETITION_REGISTRATION.update({ teamNumber = 7 }) { ID.eq(teamId) }

        val userId = !createTestUser()
        val providerId = (!MaterialService.addProvider(provider(), userId) as ApiResponse.Created).id
        val typeBoat =
            (!MaterialService.addType(MaterialTypeRequest("C4x+", MaterialCategory.BOAT, null), userId) as ApiResponse.Created).id
        !CompetitionPropertiesHasMaterialTypeRepo.create(
            listOf(CompetitionPropertiesHasMaterialTypeRecord(competitionProperties = seeded.propertiesId, materialType = typeBoat, count = 1))
        )
        !MaterialService.inviteProvider(seeded.eventId, providerId, userId)
        val offer = (
            !MaterialService.addOffer(seeded.eventId, providerId, MaterialOfferRequest(typeBoat, null, 5, 30), userId)
                as ApiResponse.Created
            ).id
        val boat7 = (
            !MaterialService.addItem(providerId, MaterialItemRequest(typeBoat, 7, "Boot 7", null, MaterialItemStatus.ACTIVE), userId)
                as ApiResponse.Created
            ).id
        !MaterialService.setRequestsForRegistration(seeded.eventId, teamId, Privilege.Scope.GLOBAL to null, listOf(offer), userId)
        val requestId = (!MaterialRequestRepo.forRegistration(teamId)).single().id
        !MaterialService.decideRequest(
            seeded.eventId, providerId, requestId, MaterialDecisionRequest(MaterialRequestStatus.CONFIRMED, null), userId,
        )
        !MaterialService.setAssignments(
            seeded.eventId, providerId, requestId, MaterialAssignmentsRequest(listOf(MaterialAssignmentEntry(boat7, null))), userId,
        )

        // Ohne Lauf: die Anfrage-Sicht fällt auf die Meldungsnummer zurück.
        val beforeMatch = (!MATERIAL_REQUEST_VIEW.select { ID.eq(requestId) }).single()
        assertEquals(7, beforeMatch.startNumber)

        // Die Setzliste macht aus Meldungsnummer 7 die Startnummer 3 in diesem Lauf.
        val match = seedMatch(seeded.propertiesId, teamId, startNumber = 3)
        val matchTeam = (!CompetitionMatchTeamRepo.getByMatchAndRegistrationId(match.matchId, teamId))!!

        val row = (!EFFECTIVE_MATERIAL_FOR_MATCH_TEAM.select { COMPETITION_MATCH_TEAM.eq(matchTeam.id) }).single()
        assertEquals(7, row.number)
        assertEquals(true, row.deviatesFromStartNumber, "#3 im Lauf, Boot 7 - das ist eine Abweichung")

        val withMatch = (!MATERIAL_REQUEST_VIEW.select { ID.eq(requestId) }).single()
        assertEquals(3, withMatch.startNumber)
        assertEquals(7, withMatch.teamNumber)
    }
}
