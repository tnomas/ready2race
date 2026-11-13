package de.lambda9.ready2race.backend.app.eventRegistration

import de.lambda9.ready2race.backend.app.competitionRegistration.seedClubWithUser
import de.lambda9.ready2race.backend.app.competitionRegistration.seedCompetitionRegistration
import de.lambda9.ready2race.backend.app.competitionRegistration.seedEvent
import de.lambda9.ready2race.backend.app.competitionRegistration.seedNamedParticipant
import de.lambda9.ready2race.backend.app.competitionRegistration.seedParticipant
import de.lambda9.ready2race.backend.app.competitionRegistration.seedSingleCompetition
import de.lambda9.ready2race.backend.app.eventRegistration.boundary.EventRegistrationService
import de.lambda9.ready2race.backend.app.eventRegistration.entity.EventRegistrationUpsertDto
import de.lambda9.ready2race.backend.database.generated.tables.records.EventRegistrationRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_REGISTRATION
import de.lambda9.ready2race.backend.database.generated.tables.references.EVENT_REGISTRATION
import de.lambda9.ready2race.backend.database.insert
import de.lambda9.ready2race.testing.testComprehension
import de.lambda9.tailwind.jooq.Jooq
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Die Sammelmeldung nummeriert die Mannschaften des Vereins neu ("#1", "#2", ...) - aber nur in
 * ihrer eigenen Veranstaltung. Die Namen vergangener Regatten stehen auf Ergebnissen und
 * Urkunden und dürfen sich durch eine neue Meldung nicht ändern.
 */
class UpsertKeepsOtherEventsTeamNamesTest {

    @Test
    fun upsertingInOneEventLeavesTeamNamesOfOtherEventsAlone() = testComprehension {
        val now = LocalDateTime.now()
        val past = seedEvent(now = now.minusYears(1))
        val np = seedNamedParticipant()
        val pastCompetition = seedSingleCompetition(past, np)
        val club = seedClubWithUser(past, "A")
        val first = seedCompetitionRegistration(pastCompetition, club, np)
        val third = seedCompetitionRegistration(pastCompetition, club, np, seedParticipant(club.clubId, "Zwei"))
        // "#2" wurde damals gelöscht - die Lücke gehört zur Geschichte der Regatta.
        !Jooq.query {
            update(COMPETITION_REGISTRATION).set(COMPETITION_REGISTRATION.NAME, "#1")
                .where(COMPETITION_REGISTRATION.ID.eq(first)).execute()
            update(COMPETITION_REGISTRATION).set(COMPETITION_REGISTRATION.NAME, "#3")
                .where(COMPETITION_REGISTRATION.ID.eq(third)).execute()
        }

        val current = seedEvent()
        !EVENT_REGISTRATION.insert(
            EventRegistrationRecord(id = UUID.randomUUID(), event = current, club = club.clubId, createdAt = now, updatedAt = now)
        )

        !EventRegistrationService.upsertRegistrationForEvent(
            current,
            EventRegistrationUpsertDto(emptyList(), emptyList(), message = "Nachtrag", callbackUrl = "https://example.org/challenge/"),
            club.user,
        )

        val names = !Jooq.query {
            select(COMPETITION_REGISTRATION.ID, COMPETITION_REGISTRATION.NAME).from(COMPETITION_REGISTRATION)
                .where(COMPETITION_REGISTRATION.COMPETITION.eq(pastCompetition))
                .fetchMap(COMPETITION_REGISTRATION.ID, COMPETITION_REGISTRATION.NAME)
        }
        assertEquals("#1", names[first])
        assertEquals("#3", names[third])
    }
}
