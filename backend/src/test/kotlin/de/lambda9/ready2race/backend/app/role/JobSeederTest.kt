package de.lambda9.ready2race.backend.app.role

import de.lambda9.ready2race.backend.app.auth.control.PrivilegeRepo
import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.role.boundary.JobSeeder
import de.lambda9.ready2race.backend.app.role.control.RoleHasPrivilegeRepo
import de.lambda9.ready2race.backend.app.role.control.RoleRepo
import de.lambda9.ready2race.backend.app.role.entity.Job
import de.lambda9.ready2race.backend.database.SYSTEM_USER
import de.lambda9.ready2race.backend.database.generated.tables.records.PrivilegeRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.RoleHasPrivilegeRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.RoleRecord
import de.lambda9.ready2race.testing.testComprehension
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class JobSeederTest {

    private val now = LocalDateTime.of(2026, 9, 7, 10, 0)

    private fun privilegeId(all: List<PrivilegeRecord>, p: Privilege): UUID =
        all.first { it.action == p.action.name && it.resource == p.resource.name && it.scope == p.scope.name }.id

    /** initializeDatabase läuft im Testrunner; jeder Job muss danach als statische Rolle liegen. */
    @Test
    fun everyJobExistsAsStaticRoleWithExactlyItsPrivileges() = testComprehension {
        val all = !PrivilegeRepo.all()
        Job.entries.forEach { job ->
            val role = assertNotNull(!RoleRepo.get(job.roleId), "Rolle für ${job.key}")
            assertTrue(role.static, job.key)
            assertEquals(job.key, role.job)
            assertEquals(job.level.name, role.level)

            val expected = job.privileges.map { privilegeId(all, it) }.toSet()
            val actual = (!RoleHasPrivilegeRepo.getPrivilegesByRole(job.roleId)).toSet()
            assertEquals(expected, actual, "Privilegien von ${job.key}")
        }
    }

    /** Ein Privileg zu viel an einer statischen Rolle wird beim nächsten Start entfernt. */
    @Test
    fun syncRemovesStrayPrivilegesFromStaticRoles() = testComprehension {
        val all = !PrivilegeRepo.all()
        val stray = privilegeId(all, Privilege.UpdateSystemGlobal)
        !RoleHasPrivilegeRepo.create(listOf(RoleHasPrivilegeRecord(role = Job.Timekeeper.roleId, privilege = stray)))

        !JobSeeder.sync(now)

        val after = !RoleHasPrivilegeRepo.getPrivilegesByRole(Job.Timekeeper.roleId)
        assertTrue(stray !in after)
    }

    /** Eine Kopie bekommt neue Job-Privilegien nachgetragen, behält aber eigene Abweichungen. */
    @Test
    fun syncAddsJobPrivilegesToCopiesButKeepsTheirDeviations() = testComprehension {
        val all = !PrivilegeRepo.all()
        val copyId = UUID.randomUUID()
        !RoleRepo.create(
            RoleRecord(
                id = copyId, name = "Zeitnahme mit Boards", description = null, static = false,
                job = Job.Timekeeper.key, level = Job.Timekeeper.level.name,
                createdAt = now, createdBy = SYSTEM_USER, updatedAt = now, updatedBy = SYSTEM_USER,
            )
        )
        val deviation = privilegeId(all, Privilege.UpdateBoardGlobal)
        !RoleHasPrivilegeRepo.create(listOf(RoleHasPrivilegeRecord(role = copyId, privilege = deviation)))

        !JobSeeder.sync(now)

        val after = (!RoleHasPrivilegeRepo.getPrivilegesByRole(copyId)).toSet()
        val jobPrivileges = Job.Timekeeper.privileges.map { privilegeId(all, it) }.toSet()
        assertEquals(jobPrivileges + deviation, after)
    }

    @Test
    fun syncIsIdempotent() = testComprehension {
        !JobSeeder.sync(now)
        !JobSeeder.sync(now)
        val count = (!RoleHasPrivilegeRepo.getPrivilegesByRole(Job.Admin.roleId)).size
        assertEquals(Job.Admin.privileges.size, count)
    }
}
