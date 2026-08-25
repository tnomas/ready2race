package de.lambda9.ready2race.backend.app.competitionProperties

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.competition.boundary.CompetitionService
import de.lambda9.ready2race.backend.app.competitionProperties.entity.CompetitionPropertiesDto
import de.lambda9.ready2race.backend.app.competitionProperties.entity.CompetitionPropertiesError
import de.lambda9.ready2race.backend.app.competitionProperties.entity.CompetitionPropertiesRequest
import de.lambda9.ready2race.backend.app.competitionTemplate.boundary.CompetitionTemplateService
import de.lambda9.ready2race.backend.app.competitionTemplate.entity.CompetitionTemplateDto
import de.lambda9.ready2race.backend.app.paceReference.boundary.PaceReferenceService
import de.lambda9.ready2race.backend.app.paceReference.entity.PaceReferenceMode
import de.lambda9.ready2race.backend.app.paceReference.entity.PaceReferenceRequest
import de.lambda9.ready2race.backend.app.competition.entity.CompetitionDto
import de.lambda9.ready2race.backend.app.timing.createTestEventWithAdmin
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.testing.testComprehension
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * Gesamtdistanz und Bezugsgröße am Wettkampf, gegen echtes Postgres.
 *
 * Beide Wege durch dieselbe [CompetitionPropertiesRequest] werden geprüft: der Wettkampf und die
 * Wettkampf-Vorlage, jeweils beim Anlegen und beim Ändern. Die Felder liegen an
 * `competition_properties`, und diese Tabelle trägt die Zeilen von beidem - ein Test nur über
 * einen der Wege belegte die Hälfte.
 */
class CompetitionDistanceAndPaceReferenceTest {

    private fun addPaceReference(
        userId: UUID,
        name: String = "Rudern",
        referenceMeters: Int = 500,
    ): App<Any?, UUID> = PaceReferenceService.addPaceReference(
        PaceReferenceRequest(
            name = name,
            mode = PaceReferenceMode.TIME_PER_DISTANCE,
            referenceMeters = referenceMeters,
        ),
        userId,
    ).map { (it as ApiResponse.Created).id }

    private fun request(
        distanceMeters: Int?,
        paceReference: UUID?,
    ) = CompetitionPropertiesRequest(
        identifier = "001",
        name = "Männer Einer",
        shortName = null,
        description = null,
        competitionCategory = null,
        namedParticipants = emptyList(),
        fees = emptyList(),
        lateRegistrationAllowed = false,
        setupTemplate = null,
        challengeConfig = null,
        ratingCategoryRequired = false,
        distanceMeters = distanceMeters,
        paceReference = paceReference,
    )

    private fun readCompetition(competitionId: UUID): App<Any?, CompetitionPropertiesDto> =
        CompetitionService.getCompetitionWithProperties(competitionId, null, Privilege.Scope.GLOBAL)
            .map { ((it as ApiResponse.Dto<*>).dto as CompetitionDto).properties }

    private fun readTemplate(templateId: UUID): App<Any?, CompetitionPropertiesDto> =
        CompetitionTemplateService.getCompetitionTemplateWithProperties(templateId)
            .map { ((it as ApiResponse.Dto<*>).dto as CompetitionTemplateDto).properties }

    @Test
    fun competitionKeepsBothFields() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val paceReferenceId = !addPaceReference(userId)

        val competitionId = ((!CompetitionService.addCompetition(
            request(distanceMeters = 2000, paceReference = paceReferenceId),
            userId,
            eventId,
        )) as ApiResponse.Created).id

        val properties = !readCompetition(competitionId)
        assertEquals(2000, properties.distanceMeters)
        // Aufgelöst wie die Kategorie: Die Anzeige bekommt Art und Bezugsstrecke gleich mit und
        // muss den Katalog nicht ein zweites Mal fragen.
        assertEquals(paceReferenceId, properties.paceReference?.id)
        assertEquals("Rudern", properties.paceReference?.name)
        assertEquals(PaceReferenceMode.TIME_PER_DISTANCE, properties.paceReference?.mode)
        assertEquals(500, properties.paceReference?.referenceMeters)
    }

    @Test
    fun competitionUpdateChangesBothFields() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val rowing = !addPaceReference(userId)
        val running = !addPaceReference(userId, name = "Laufen", referenceMeters = 1000)

        val competitionId = ((!CompetitionService.addCompetition(
            request(distanceMeters = 2000, paceReference = rowing),
            userId,
            eventId,
        )) as ApiResponse.Created).id

        !CompetitionService.updateCompetition(
            request(distanceMeters = 6000, paceReference = running),
            userId,
            competitionId,
            eventId,
        )

        val changed = !readCompetition(competitionId)
        assertEquals(6000, changed.distanceMeters)
        assertEquals(running, changed.paceReference?.id)
        assertEquals(1000, changed.paceReference?.referenceMeters)

        // Beide Felder sind optional: Zurücknehmen muss auch gehen, sonst bliebe eine einmal
        // gesetzte Bezugsgröße für immer am Wettkampf kleben.
        !CompetitionService.updateCompetition(
            request(distanceMeters = null, paceReference = null),
            userId,
            competitionId,
            eventId,
        )

        val cleared = !readCompetition(competitionId)
        assertNull(cleared.distanceMeters)
        assertNull(cleared.paceReference)
    }

    @Test
    fun templateKeepsBothFields() = testComprehension {
        val (_, userId) = !createTestEventWithAdmin()
        val paceReferenceId = !addPaceReference(userId)

        val templateId = ((!CompetitionTemplateService.addCompetitionTemplate(
            request(distanceMeters = 1000, paceReference = paceReferenceId),
            userId,
        )) as ApiResponse.Created).id

        val properties = !readTemplate(templateId)
        assertEquals(1000, properties.distanceMeters)
        assertEquals(paceReferenceId, properties.paceReference?.id)
        assertEquals("Rudern", properties.paceReference?.name)
        assertEquals(PaceReferenceMode.TIME_PER_DISTANCE, properties.paceReference?.mode)
        assertEquals(500, properties.paceReference?.referenceMeters)
    }

    @Test
    fun templateUpdateChangesBothFields() = testComprehension {
        val (_, userId) = !createTestEventWithAdmin()
        val rowing = !addPaceReference(userId)
        val running = !addPaceReference(userId, name = "Laufen", referenceMeters = 1000)

        val templateId = ((!CompetitionTemplateService.addCompetitionTemplate(
            request(distanceMeters = 1000, paceReference = rowing),
            userId,
        )) as ApiResponse.Created).id

        !CompetitionTemplateService.updateCompetitionTemplate(
            templateId,
            request(distanceMeters = 350, paceReference = running),
            userId,
        )

        val changed = !readTemplate(templateId)
        assertEquals(350, changed.distanceMeters)
        assertEquals(running, changed.paceReference?.id)
        assertEquals(1000, changed.paceReference?.referenceMeters)
    }

    @Test
    fun unknownPaceReferenceIsRejected() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()

        // Als Domänenfehler, nicht als Fremdschlüssel-Defekt - und für beide Wege gleich.
        assertKIOFails(CompetitionPropertiesError.PaceReferenceUnknown) {
            CompetitionService.addCompetition(
                request(distanceMeters = 2000, paceReference = UUID.randomUUID()),
                userId,
                eventId,
            )
        }

        assertKIOFails(CompetitionPropertiesError.PaceReferenceUnknown) {
            CompetitionTemplateService.addCompetitionTemplate(
                request(distanceMeters = 2000, paceReference = UUID.randomUUID()),
                userId,
            )
        }
    }

    @Test
    fun deletingThePaceReferenceLeavesTheCompetition() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val paceReferenceId = !addPaceReference(userId)

        val competitionId = ((!CompetitionService.addCompetition(
            request(distanceMeters = 2000, paceReference = paceReferenceId),
            userId,
            eventId,
        )) as ApiResponse.Created).id

        // `on delete set null`: Der Wettkampf verliert nur die Tempo-Anzeige, nicht seine Distanz -
        // und das Löschen wird nicht gesperrt.
        !PaceReferenceService.deletePaceReference(paceReferenceId)

        val properties = !readCompetition(competitionId)
        assertNull(properties.paceReference)
        assertEquals(2000, properties.distanceMeters)
    }
}
