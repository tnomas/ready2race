package de.lambda9.ready2race.backend.app.material

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.appuser.boundary.AppUserService
import de.lambda9.ready2race.backend.app.appuser.control.AppUserRepo
import de.lambda9.ready2race.backend.app.appuser.entity.UpdateAppUserRequest
import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.material.boundary.MaterialService
import de.lambda9.ready2race.backend.app.material.entity.MaterialProviderRequest
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserRecord
import de.lambda9.ready2race.testing.testComprehension
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.orDie
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class MaterialProviderAssignmentTest {

    private fun createTestUser(): App<Nothing, UUID> = KIO.comprehension {
        val now = LocalDateTime.now()
        val id = UUID.randomUUID()
        !AppUserRepo.create(
            AppUserRecord(
                id = id,
                email = "m-$id@test.de",
                password = "x",
                firstname = "M",
                lastname = "T",
                language = "de",
                createdAt = now,
                updatedAt = now,
            )
        ).orDie()
        KIO.ok(id)
    }

    @Test
    fun assigningProviderAddsRole() = testComprehension {
        val admin = !createTestUser()
        val target = !createTestUser()
        val providerId = (
            !MaterialService.addProvider(
                MaterialProviderRequest("Hafen Süd", null, null, null, null),
                admin,
            ) as ApiResponse.Created
            ).id

        !AppUserService.setMaterialProvider(target, providerId, admin)

        val user = !AppUserRepo.getWithPrivileges(target).orDie()
        assertEquals(providerId, user!!.materialProvider)
        assertTrue(user.privileges!!.any { it!!.resource == "MATERIAL" && it.scope == "OWN" })

        !AppUserService.setMaterialProvider(target, null, admin)

        val cleared = !AppUserRepo.getWithPrivileges(target).orDie()
        assertNull(cleared!!.materialProvider)
        assertTrue(cleared.privileges!!.none { it!!.resource == "MATERIAL" })
    }

    @Test
    fun roleFollowsProviderThroughUserUpdate() = testComprehension {
        // Die Rolle Materialanbieter wird von der Anbieter-Zuordnung abgeleitet, nicht von der
        // Rollenliste im Nutzer-Update - genau das prüft dieser Test in beide Richtungen.
        val admin = !createTestUser()
        val target = !createTestUser()
        val providerId = (
            !MaterialService.addProvider(
                MaterialProviderRequest("Hafen Nord", null, null, null, null),
                admin,
            ) as ApiResponse.Created
            ).id

        !AppUserService.setMaterialProvider(target, providerId, admin)

        // Ein Update mit leerer Rollenliste darf die Rolle nicht entfernen, solange der Anbieter
        // noch zugeordnet ist.
        !AppUserService.update(
            request = UpdateAppUserRequest(firstname = "M", lastname = "T", roles = emptyList()),
            scope = Privilege.Scope.GLOBAL,
            requestingUserId = admin,
            targetUserId = target,
        )

        val stillAssigned = !AppUserRepo.getWithPrivileges(target).orDie()
        assertEquals(providerId, stillAssigned!!.materialProvider)
        assertTrue(stillAssigned.privileges!!.any { it!!.resource == "MATERIAL" && it.scope == "OWN" })

        !AppUserService.setMaterialProvider(target, null, admin)

        val cleared = !AppUserRepo.getWithPrivileges(target).orDie()
        assertNull(cleared!!.materialProvider)
        assertTrue(cleared.privileges!!.none { it!!.resource == "MATERIAL" })
    }
}
