package de.lambda9.ready2race.backend.app.competitionProperties

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.competition.boundary.CompetitionService
import de.lambda9.ready2race.backend.app.competition.entity.CompetitionDto
import de.lambda9.ready2race.backend.app.competitionProperties.entity.CompetitionPropertiesDto
import de.lambda9.ready2race.backend.app.competitionProperties.entity.CompetitionPropertiesRequest
import de.lambda9.ready2race.backend.app.material.boundary.MaterialService
import de.lambda9.ready2race.backend.app.material.entity.MaterialCategory
import de.lambda9.ready2race.backend.app.material.entity.MaterialDemandRequestDto
import de.lambda9.ready2race.backend.app.material.entity.MaterialTypeRequest
import de.lambda9.ready2race.backend.app.timing.createTestEventWithAdmin
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.testing.testComprehension
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Bedarf am Wettkampf (materialTypes), gegen echtes Postgres - Gegenstück zu den Gebühren
 * (fees), aber ohne eigenen Test dafür bislang: hier gleich mit Anlegen, Lesen und Entfernen.
 */
class CompetitionPropertiesMaterialDemandTest {

    private fun readCompetition(competitionId: UUID): App<Any?, CompetitionPropertiesDto> =
        CompetitionService.getCompetitionWithProperties(competitionId, null, Privilege.Scope.GLOBAL)
            .map { ((it as ApiResponse.Dto<*>).dto as CompetitionDto).properties }

    // CompetitionPropertiesRequest.example trägt an mehreren Stellen zufällige, nicht existierende
    // UUIDs (setupTemplate, competitionCategory, paceReference, namedParticipants, fees) - die
    // Existenzprüfungen in CompetitionPropertiesService.checkRequestReferences ließen ein simples
    // .copy(materialTypes = ...) darauf scheitern. Deshalb hier ein eigener, minimaler Rumpf, wie
    // ihn auch CompetitionDistanceAndPaceReferenceTest verwendet.
    private fun request(materialTypes: List<MaterialDemandRequestDto>) = CompetitionPropertiesRequest(
        identifier = "001",
        name = "Männer Vierer",
        shortName = null,
        description = null,
        competitionCategory = null,
        namedParticipants = emptyList(),
        fees = emptyList(),
        materialTypes = materialTypes,
        lateRegistrationAllowed = false,
        setupTemplate = null,
        challengeConfig = null,
        ratingCategoryRequired = false,
        distanceMeters = null,
        paceReference = null,
    )

    @Test
    fun demandIsSavedAndRemovable() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val typeId = (!MaterialService.addType(
            MaterialTypeRequest("C4x+", MaterialCategory.BOAT, null), userId
        ) as ApiResponse.Created).id

        val competitionId = ((!CompetitionService.addCompetition(
            request(materialTypes = listOf(MaterialDemandRequestDto(typeId, 1))),
            userId,
            eventId,
        )) as ApiResponse.Created).id

        val properties = !readCompetition(competitionId)
        assertEquals(1, properties.materialTypes.size)
        val demand = properties.materialTypes.single()
        assertEquals(typeId, demand.materialType)
        assertEquals("C4x+", demand.name)
        assertEquals(MaterialCategory.BOAT, demand.category)
        assertEquals(1, demand.count)

        // Aktualisieren mit leerer Liste entfernt den Bedarf wieder - kein Rest hängen lassen.
        !CompetitionService.updateCompetition(
            request(materialTypes = emptyList()),
            userId,
            competitionId,
            eventId,
        )

        val cleared = !readCompetition(competitionId)
        assertTrue(cleared.materialTypes.isEmpty())
    }
}
