package de.lambda9.ready2race.backend.app.competitionRegistration

import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.competitionRegistration.boundary.CompetitionRegistrationService
import de.lambda9.ready2race.backend.app.competitionRegistration.entity.CompetitionRegistrationDto
import de.lambda9.ready2race.backend.app.competitionRegistration.entity.CompetitionRegistrationSort
import de.lambda9.ready2race.backend.app.eventRegistration.boundary.EventRegistrationService
import de.lambda9.ready2race.backend.app.material.seedOpenTeamEvent
import de.lambda9.ready2race.backend.app.material.teamDto
import de.lambda9.ready2race.backend.app.material.upsertDto
import de.lambda9.ready2race.backend.pagination.PaginationParameters
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_REGISTRATION
import de.lambda9.ready2race.backend.database.selectOne
import de.lambda9.ready2race.testing.testComprehension
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

/**
 * Die Meldungsliste eines Wettkampfs reicht die Meldungsnummer (`team_number`) durch: vor der
 * Fixierung leer, danach genau die Zahl, die die Fixierung gespeichert hat.
 */
class CompetitionRegistrationTeamNumberTest {

    @Test
    fun teamNumberIsNullBeforeAndSetAfterFinalizing() = testComprehension {
        val seeded = seedOpenTeamEvent()
        val registrationId = UUID.randomUUID()
        !EventRegistrationService.upsertRegistrationForEvent(
            seeded.eventId,
            upsertDto(
                seeded,
                listOf(teamDto(registrationId, seeded.namedParticipantId, listOf(seeded.participant1, seeded.participant2))),
            ),
            seeded.user,
        )

        val params = PaginationParameters<CompetitionRegistrationSort>(limit = null, offset = null, sort = null, search = null)
        fun listed(response: ApiResponse): CompetitionRegistrationDto =
            @Suppress("UNCHECKED_CAST")
            (response as ApiResponse.Page<CompetitionRegistrationDto, CompetitionRegistrationSort>)
                .data.single { it.id == registrationId }

        val before = listed(
            !CompetitionRegistrationService.registrationPage(params, seeded.competitionId, Privilege.Scope.GLOBAL, seeded.user)
        )
        assertNull(before.teamNumber)

        !EventRegistrationService.finalizeRegistrations(
            seeded.user.id!!, seeded.eventId, keepNumbers = false, alignMaterialNumbers = false,
        )

        val stored = (!COMPETITION_REGISTRATION.selectOne { ID.eq(registrationId) })!!.teamNumber
        assertNotNull(stored)
        val after = listed(
            !CompetitionRegistrationService.registrationPage(params, seeded.competitionId, Privilege.Scope.GLOBAL, seeded.user)
        )
        assertEquals(stored, after.teamNumber)
    }
}
