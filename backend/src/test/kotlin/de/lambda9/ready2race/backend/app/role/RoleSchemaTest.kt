package de.lambda9.ready2race.backend.app.role

import de.lambda9.ready2race.backend.app.role.control.RoleRepo
import de.lambda9.ready2race.backend.database.ADMIN_ROLE
import de.lambda9.ready2race.backend.database.CLUB_REPRESENTATIVE_ROLE
import de.lambda9.ready2race.backend.database.USER_ROLE
import de.lambda9.ready2race.testing.testComprehension
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull

/** Die Migration V202609081000 hängt Job und Ebene an die drei bestehenden statischen Rollen. */
class RoleSchemaTest {

    @Test
    fun theThreeLegacyRolesCarryJobAndLevel() = testComprehension {
        val admin = assertNotNull(!RoleRepo.get(ADMIN_ROLE))
        assertEquals("ADMIN", admin.job)
        assertEquals("GLOBAL", admin.level)

        val user = assertNotNull(!RoleRepo.get(USER_ROLE))
        assertEquals("USER", user.job)
        assertEquals("SELF", user.level)

        val club = assertNotNull(!RoleRepo.get(CLUB_REPRESENTATIVE_ROLE))
        assertEquals("CLUB_REPRESENTATIVE", club.job)
        assertEquals("CLUB", club.level)
    }
}
