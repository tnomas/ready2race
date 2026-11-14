package de.lambda9.ready2race.backend.app.eventRegistration

import de.lambda9.ready2race.backend.app.auth.entity.AuthError
import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.competitionRegistration.seedClubWithUser
import de.lambda9.ready2race.backend.app.competitionRegistration.seedRegistrations
import de.lambda9.ready2race.backend.app.eventRegistration.boundary.EventRegistrationService
import de.lambda9.ready2race.backend.app.eventRegistration.entity.EventRegistrationViewSort
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserWithPrivilegesRecord
import de.lambda9.ready2race.backend.pagination.PaginationParameters
import de.lambda9.ready2race.testing.testComprehension
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Die Meldungsliste einer Veranstaltung: mit globalem Leserecht alle Meldungen, mit Leserecht im
 * Umfang OWN nur die des eigenen Vereins - auch in der Zählung, sonst verrät die Seitenleiste,
 * wie viele Vereine gemeldet haben. Ohne Verein gibt es bei OWN nichts zu sehen.
 */
class PageForEventScopeTest {

    private val params = PaginationParameters<EventRegistrationViewSort>(null, null, null, null)

    @Test
    fun ownSeesOnlyTheOwnClubsRegistration() = testComprehension {
        val seeded = seedRegistrations()
        // Eine dritte Meldung, damit "eine von mehreren" nicht zufällig "die einzige" ist.
        seedClubWithUser(seeded.eventId, "C")

        val page = !EventRegistrationService.pageForEvent(
            seeded.eventId, params, seeded.a.user, Privilege.Scope.OWN,
        )

        assertEquals(listOf(seeded.a.eventRegistrationId), page.data.map { it.id })
        assertEquals(1, page.pagination.total)
    }

    @Test
    fun ownWithoutClubIsForbidden() = testComprehension {
        val seeded = seedRegistrations()
        val withoutClub = AppUserWithPrivilegesRecord(
            id = seeded.a.user.id,
            email = seeded.a.user.email,
            firstname = "Ohne",
            lastname = "Verein",
            language = "DE",
            club = null,
            privileges = emptyArray(),
        )

        assertKIOFails(AuthError.PrivilegeMissing) {
            EventRegistrationService.pageForEvent(seeded.eventId, params, withoutClub, Privilege.Scope.OWN)
        }
    }

    @Test
    fun globalSeesAllRegistrations() = testComprehension {
        val seeded = seedRegistrations()
        seedClubWithUser(seeded.eventId, "C")

        val page = !EventRegistrationService.pageForEvent(
            seeded.eventId, params, seeded.a.user, Privilege.Scope.GLOBAL,
        )

        assertEquals(3, page.pagination.total)
        assertEquals(3, page.data.size)
        assert(page.data.map { it.id }.containsAll(listOf(seeded.a.eventRegistrationId, seeded.b.eventRegistrationId)))
    }
}
