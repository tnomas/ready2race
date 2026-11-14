package de.lambda9.ready2race.backend.app.auth

import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class PrivilegeEntriesTest {

    /** Zwei data objects mit demselben Tripel wären in der Datenbank ein Unique-Verstoß. */
    @Test
    fun everyTripleIsUnique() {
        val triples = Privilege.entries.map { Triple(it.action, it.resource, it.scope) }
        assertEquals(triples.size, triples.toSet().size)
    }

    @Test
    fun theNewResourcesCarryTheirPrivileges() {
        val entries = Privilege.entries
        assertTrue(entries.contains(Privilege.CreateRoleGlobal))
        assertTrue(entries.contains(Privilege.ReadRoleGlobal))
        assertTrue(entries.contains(Privilege.UpdateRoleGlobal))
        assertTrue(entries.contains(Privilege.DeleteRoleGlobal))
        assertTrue(entries.contains(Privilege.ReadStaffGlobal))
        assertTrue(entries.contains(Privilege.UpdateStaffGlobal))
        assertTrue(entries.contains(Privilege.UpdateSystemGlobal))
    }
}
