package de.lambda9.ready2race.backend.app.participantRequirement

import de.lambda9.ready2race.backend.app.JEnv
import de.lambda9.ready2race.backend.app.participantRequirement.boundary.ParticipantRequirementService
import de.lambda9.ready2race.backend.app.participantRequirement.entity.ParticipantRequirementError
import de.lambda9.ready2race.backend.app.timing.createTestEventWithAdmin
import de.lambda9.ready2race.backend.database.generated.tables.records.NamedParticipantRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.ParticipantRequirementRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.NAMED_PARTICIPANT
import de.lambda9.ready2race.backend.database.generated.tables.references.PARTICIPANT_REQUIREMENT
import de.lambda9.ready2race.backend.database.insert
import de.lambda9.ready2race.testing.kio.TestComprehensionScope
import de.lambda9.ready2race.testing.testComprehension
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test

/**
 * Bedingung je Rolle zuweisen: eine zweite Zuweisung ist ein fachlicher Konflikt (409), keine
 * NullPointerException (500); unbekannte Bedingung, Rolle oder Veranstaltung sind 404 statt
 * Fremdschlüssel-500.
 */
class AssignRequirementToNamedParticipantTest {

    private data class Seed(val eventId: UUID, val userId: UUID, val requirementId: UUID, val roleId: UUID)

    private fun TestComprehensionScope<JEnv>.seed(): Seed {
        val (eventId, userId) = !createTestEventWithAdmin()
        val now = LocalDateTime.now()
        val requirementId = UUID.randomUUID()
        !PARTICIPANT_REQUIREMENT.insert(
            ParticipantRequirementRecord(
                id = requirementId,
                name = "Waage-$requirementId",
                optional = false,
                createdAt = now,
                updatedAt = now,
            )
        )
        val roleId = UUID.randomUUID()
        !NAMED_PARTICIPANT.insert(NamedParticipantRecord(id = roleId, name = "Steuer-$roleId", createdAt = now, updatedAt = now))
        return Seed(eventId, userId, requirementId, roleId)
    }

    @Test
    fun secondAssignmentIsInUseNotA500() = testComprehension {
        val s = seed()
        !ParticipantRequirementService.assignRequirementToNamedParticipant(s.eventId, s.requirementId, s.roleId, false, s.userId)
        assertKIOFails(ParticipantRequirementError.InUse) {
            ParticipantRequirementService.assignRequirementToNamedParticipant(s.eventId, s.requirementId, s.roleId, true, s.userId)
        }
    }

    @Test
    fun unknownRequirementRoleOrEventIsNotFound() = testComprehension {
        val s = seed()
        assertKIOFails(ParticipantRequirementError.NotFound) {
            ParticipantRequirementService.assignRequirementToNamedParticipant(s.eventId, UUID.randomUUID(), s.roleId, false, s.userId)
        }
        assertKIOFails(ParticipantRequirementError.NotFound) {
            ParticipantRequirementService.assignRequirementToNamedParticipant(s.eventId, s.requirementId, UUID.randomUUID(), false, s.userId)
        }
        assertKIOFails(ParticipantRequirementError.NotFound) {
            ParticipantRequirementService.assignRequirementToNamedParticipant(UUID.randomUUID(), s.requirementId, s.roleId, false, s.userId)
        }
    }
}
