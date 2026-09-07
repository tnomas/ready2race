package de.lambda9.ready2race.backend.app.material

import de.lambda9.ready2race.backend.app.auth.control.PrivilegeRepo
import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.role.control.RoleHasPrivilegeRepo
import de.lambda9.ready2race.backend.database.MATERIAL_PROVIDER_ROLE
import de.lambda9.ready2race.testing.testComprehension
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class MaterialPrivilegeTest {

    @Test
    fun materialPrivilegesAreSeeded() = testComprehension {
        val all = !PrivilegeRepo.all()
        val material = all.filter { it.resource == "MATERIAL" }
        assertEquals(
            setOf("READ:OWN", "READ:GLOBAL", "UPDATE:OWN", "UPDATE:GLOBAL"),
            material.map { "${it.action}:${it.scope}" }.toSet(),
        )
    }

    @Test
    fun providerRoleCarriesOwnPrivilegesOnly() = testComprehension {
        val ids = !RoleHasPrivilegeRepo.getPrivilegesByRole(MATERIAL_PROVIDER_ROLE)
        val all = !PrivilegeRepo.all()
        val names = all.filter { it.id in ids }.map { "${it.action}:${it.resource}:${it.scope}" }.toSet()
        assertEquals(setOf("READ:MATERIAL:OWN", "UPDATE:MATERIAL:OWN"), names)
        assertTrue(Privilege.entries.any { it == Privilege.UpdateMaterialOwn })
    }
}
