package de.lambda9.ready2race.backend.app.role

import de.lambda9.ready2race.backend.app.JEnv
import de.lambda9.ready2race.backend.app.appuser.control.AppUserHasRoleRepo
import de.lambda9.ready2race.backend.app.appuser.control.AppUserRepo
import de.lambda9.ready2race.backend.app.auth.control.PrivilegeRepo
import de.lambda9.ready2race.backend.app.auth.entity.AuthError
import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.email.entity.EmailLanguage
import de.lambda9.ready2race.backend.app.role.boundary.RoleService
import de.lambda9.ready2race.backend.app.role.control.RoleHasPrivilegeRepo
import de.lambda9.ready2race.backend.app.role.control.RoleRepo
import de.lambda9.ready2race.backend.app.role.entity.Job
import de.lambda9.ready2race.backend.app.role.entity.RoleError
import de.lambda9.ready2race.backend.app.role.entity.RoleLevel
import de.lambda9.ready2race.backend.app.role.entity.RoleRequest
import de.lambda9.ready2race.backend.database.SYSTEM_USER
import de.lambda9.ready2race.backend.database.USER_ROLE
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserHasRoleRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserWithPrivilegesRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.RoleHasPrivilegeRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.RoleRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.APP_USER_WITH_PRIVILEGES
import de.lambda9.ready2race.testing.kio.TestComprehensionScope
import de.lambda9.ready2race.testing.testComprehension
import de.lambda9.tailwind.jooq.Jooq
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Die drei Vergaberegeln aus dem Rechtekonzept (Spec 7.1):
 *  1. kein Teilmengen-Bruch, 2. nicht an sich selbst, 3. nach oben ist dicht.
 */
class RoleAssignmentRulesTest {

    private val now = LocalDateTime.of(2026, 9, 7, 11, 0)

    /** Konto mit genau diesen Privilegien über eine Wegwerf-Rolle; liefert den Privilegien-Datensatz. */
    private fun TestComprehensionScope<JEnv>.userWith(privileges: List<Privilege>): AppUserWithPrivilegesRecord {
        val roleId = UUID.randomUUID()
        !RoleRepo.create(
            RoleRecord(
                id = roleId, name = "Test $roleId", description = null, static = false,
                job = Job.Admin.key, level = "GLOBAL",
                createdAt = now, createdBy = SYSTEM_USER, updatedAt = now, updatedBy = SYSTEM_USER,
            )
        )
        val all = !PrivilegeRepo.all()
        val ids = privileges.map { p -> all.first { it.action == p.action.name && it.resource == p.resource.name && it.scope == p.scope.name }.id }
        !RoleHasPrivilegeRepo.create(ids.map { RoleHasPrivilegeRecord(role = roleId, privilege = it) })

        val userId = UUID.randomUUID()
        !AppUserRepo.create(
            AppUserRecord(
                id = userId, email = "rules-$userId@example.org", firstname = "Regel", lastname = "Test",
                password = "x", language = EmailLanguage.DE.name,
                createdAt = now, createdBy = SYSTEM_USER, updatedAt = now, updatedBy = SYSTEM_USER,
            )
        )
        !AppUserHasRoleRepo.create(listOf(
            AppUserHasRoleRecord(appUser = userId, role = USER_ROLE),
            AppUserHasRoleRecord(appUser = userId, role = roleId),
        ))
        return assertNotNull(!Jooq.query { selectFrom(APP_USER_WITH_PRIVILEGES).where(APP_USER_WITH_PRIVILEGES.ID.eq(userId)).fetchOne() })
    }

    private fun staffPrivileges(vararg more: Privilege) = listOf(Privilege.UpdateStaffGlobal, Privilege.ReadRoleGlobal) + more

    @Test
    fun anAdminCannotAssignSuperadmin() = testComprehension {
        val admin = userWith(Job.Admin.privileges)
        val target = userWith(emptyList())
        assertKIOFails(RoleError.CannotAssignRoles(notFound = emptyList(), notAssignable = listOf(Job.Superadmin.roleId))) {
            RoleService.checkAssignable(admin, listOf(Job.Superadmin.roleId), target.id!!)
        }
    }

    @Test
    fun staffRightAloneAssignsOnlyRolesWithinOwnPrivileges() = testComprehension {
        val requester = userWith(staffPrivileges(*Job.Timekeeper.privileges.toTypedArray()))
        val target = userWith(emptyList())
        assertKIOSucceeds { RoleService.checkAssignable(requester, listOf(Job.Timekeeper.roleId), target.id!!) }
        assertKIOFails(RoleError.CannotAssignRoles(notFound = emptyList(), notAssignable = listOf(Job.Judge.roleId))) {
            RoleService.checkAssignable(requester, listOf(Job.Judge.roleId), target.id!!)
        }
    }

    @Test
    fun withoutStaffRightNothingIsAssignable() = testComprehension {
        val requester = userWith(Job.Timekeeper.privileges)
        val target = userWith(emptyList())
        assertKIOFails(AuthError.PrivilegeMissing) {
            RoleService.checkAssignable(requester, listOf(Job.Timekeeper.roleId), target.id!!)
        }
    }

    @Test
    fun nobodyAssignsToThemselves() = testComprehension {
        val admin = userWith(Job.Admin.privileges)
        assertKIOFails(RoleError.SelfAssignment) {
            RoleService.checkAssignable(admin, listOf(Job.Timekeeper.roleId), admin.id!!)
        }
    }

    @Test
    fun superadminAccountsAreClosedUpwards() = testComprehension {
        val admin = userWith(Job.Admin.privileges)
        val superadmin = userWith(Job.Superadmin.privileges)
        !AppUserHasRoleRepo.create(AppUserHasRoleRecord(appUser = superadmin.id!!, role = Job.Superadmin.roleId))
        assertKIOFails(AuthError.PrivilegeMissing) {
            RoleService.checkAssignable(admin, listOf(Job.Timekeeper.roleId), superadmin.id!!)
        }
        val boss = userWith(Job.Superadmin.privileges)
        assertKIOSucceeds { RoleService.checkAssignable(boss, listOf(Job.Timekeeper.roleId), superadmin.id!!) }
    }

    @Test
    fun staticJobsAreAssignable() = testComprehension {
        val boss = userWith(Job.Superadmin.privileges)
        val target = userWith(emptyList())
        assertKIOSucceeds { RoleService.checkAssignable(boss, listOf(Job.Admin.roleId, Job.Judge.roleId), target.id!!) }
    }

    @Test
    fun aRoleIsCreatedOnlyAsCopyOfAJobAndWithinOwnPrivileges() = testComprehension {
        val requester = userWith(listOf(Privilege.CreateRoleGlobal) + Job.Timekeeper.privileges)
        val all = !PrivilegeRepo.all()
        val timing = all.first { it.action == "UPDATE" && it.resource == "APP_TIMING" && it.scope == "GLOBAL" }.id
        val system = all.first { it.action == "UPDATE" && it.resource == "SYSTEM" && it.scope == "GLOBAL" }.id

        assertKIOFails(RoleError.JobRequired) {
            RoleService.addRole(RoleRequest("Ohne Job", null, listOf(timing), null), requester)
        }
        assertKIOFails(RoleError.JobUnknown) {
            RoleService.addRole(RoleRequest("Falsch", null, listOf(timing), "GIBTS_NICHT"), requester)
        }
        assertKIOFails(RoleError.PrivilegesBeyondOwn(listOf(system))) {
            RoleService.addRole(RoleRequest("Zu viel", null, listOf(timing, system), Job.Timekeeper.key), requester)
        }

        val created = !RoleService.addRole(RoleRequest("Zeitnahme Kopie", null, listOf(timing), Job.Timekeeper.key), requester)
        val record = assertNotNull(!RoleRepo.get(created.id))
        assertEquals(Job.Timekeeper.key, record.job)
        assertEquals("EVENT", record.level)
        assertTrue(!record.static)
    }

    @Test
    fun aCopyOfASelfLevelJobAcceptsOnlyOwnScope() = testComprehension {
        val boss = userWith(Job.Superadmin.privileges)
        val all = !PrivilegeRepo.all()
        val global = all.first { it.resource == "USER" && it.action == "READ" && it.scope == "GLOBAL" }.id
        assertKIOFails(RoleError.ScopeNotAllowedForLevel(RoleLevel.SELF)) {
            RoleService.addRole(RoleRequest("Nutzer plus", null, listOf(global), Job.User.key), boss)
        }
    }

    @Test
    fun emptyRoleListNeedsNoStaffRight() = testComprehension {
        val requester = userWith(emptyList())
        val target = userWith(emptyList())
        assertKIOSucceeds { RoleService.checkAssignable(requester, emptyList(), target.id!!) }
        assertKIOSucceeds { RoleService.checkAssignable(requester, emptyList(), requester.id!!) }
    }

    @Test
    fun updatingARoleRequiresCoveringItsExistingPrivileges() = testComprehension {
        val boss = userWith(Job.Superadmin.privileges)
        val all = !PrivilegeRepo.all()
        val liveDashboard = all.first {
            it.action == "UPDATE" && it.resource == "LIVE_DASHBOARD" && it.scope == "GLOBAL"
        }.id
        val timing = all.first {
            it.action == "UPDATE" && it.resource == "APP_TIMING" && it.scope == "GLOBAL"
        }.id

        val created = !RoleService.addRole(
            RoleRequest("Schiedsrichter Kopie", null, listOf(liveDashboard), Job.Judge.key),
            boss,
        )

        val requester = userWith(listOf(Privilege.UpdateRoleGlobal) + Job.Timekeeper.privileges)
        assertKIOFails(RoleError.PrivilegesBeyondOwn(listOf(liveDashboard))) {
            RoleService.updateRole(created.id, RoleRequest("Umbenannt", null, listOf(timing), null), requester)
        }

        assertKIOSucceeds {
            RoleService.updateRole(created.id, RoleRequest("Umbenannt", null, listOf(timing), null), boss)
        }
        val record = assertNotNull(!RoleRepo.get(created.id))
        assertEquals("JUDGE", record.job)
        assertEquals("EVENT", record.level)
        val privileges = !RoleHasPrivilegeRepo.getPrivilegeRecordsByRoles(listOf(created.id))
        assertEquals(listOf(timing), (privileges[created.id] ?: emptyList()).map { it.id })
    }

    @Test
    fun deletingARoleRequiresCoveringItsPrivileges() = testComprehension {
        val boss = userWith(Job.Superadmin.privileges)
        val all = !PrivilegeRepo.all()
        val liveDashboard = all.first {
            it.action == "UPDATE" && it.resource == "LIVE_DASHBOARD" && it.scope == "GLOBAL"
        }.id

        val created = !RoleService.addRole(
            RoleRequest("Schiedsrichter Kopie", null, listOf(liveDashboard), Job.Judge.key),
            boss,
        )

        val requester = userWith(listOf(Privilege.UpdateRoleGlobal) + Job.Timekeeper.privileges)
        assertKIOFails(RoleError.PrivilegesBeyondOwn(listOf(liveDashboard))) {
            RoleService.deleteRole(created.id, requester)
        }

        assertKIOSucceeds { RoleService.deleteRole(created.id, boss) }
        assertEquals(null, !RoleRepo.get(created.id))
    }
}
