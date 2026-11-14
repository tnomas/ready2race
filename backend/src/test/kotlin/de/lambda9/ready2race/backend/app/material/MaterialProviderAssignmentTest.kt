package de.lambda9.ready2race.backend.app.material

import de.lambda9.ready2race.backend.app.JEnv
import de.lambda9.ready2race.backend.app.appuser.boundary.AppUserService
import de.lambda9.ready2race.backend.app.appuser.control.AppUserHasRoleRepo
import de.lambda9.ready2race.backend.app.appuser.control.AppUserRepo
import de.lambda9.ready2race.backend.app.appuser.entity.InviteRequest
import de.lambda9.ready2race.backend.app.appuser.entity.UpdateAppUserRequest
import de.lambda9.ready2race.backend.app.auth.control.PrivilegeRepo
import de.lambda9.ready2race.backend.app.auth.entity.AuthError
import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.email.entity.EmailLanguage
import de.lambda9.ready2race.backend.app.material.boundary.MaterialService
import de.lambda9.ready2race.backend.app.material.entity.MaterialProviderRequest
import de.lambda9.ready2race.backend.app.role.boundary.RoleService
import de.lambda9.ready2race.backend.app.role.control.RoleHasPrivilegeRepo
import de.lambda9.ready2race.backend.app.role.control.RoleRepo
import de.lambda9.ready2race.backend.app.role.entity.Job
import de.lambda9.ready2race.backend.app.role.entity.RoleError
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.database.MATERIAL_PROVIDER_ROLE
import de.lambda9.ready2race.backend.database.SUPERADMIN_ROLE
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
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Die Rolle Materialanbieter ist systemverwaltet: allein die Anbieter-Zuordnung vergibt und
 * entzieht sie, unter denselben Vergaberegeln wie jede Rollenvergabe (Rechtekonzept Schritt 1).
 * Die normale Rollenpflege lässt sie stehen und kann sie nicht vergeben.
 */
class MaterialProviderAssignmentTest {

    private val now = LocalDateTime.of(2026, 11, 14, 9, 0)

    /** Konto mit genau diesen Privilegien über eine Wegwerf-Rolle. */
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
        val ids = privileges.map { p ->
            all.first { it.action == p.action.name && it.resource == p.resource.name && it.scope == p.scope.name }.id
        }
        !RoleHasPrivilegeRepo.create(ids.map { RoleHasPrivilegeRecord(role = roleId, privilege = it) })
        return withRoles(listOf(USER_ROLE, roleId))
    }

    /** Konto, das genau diese Rollen trägt. */
    private fun TestComprehensionScope<JEnv>.withRoles(roles: List<UUID>): AppUserWithPrivilegesRecord {
        val userId = UUID.randomUUID()
        !AppUserRepo.create(
            AppUserRecord(
                id = userId, email = "material-$userId@example.org", firstname = "M", lastname = "T",
                password = "x", language = EmailLanguage.DE.name,
                createdAt = now, createdBy = SYSTEM_USER, updatedAt = now, updatedBy = SYSTEM_USER,
            )
        )
        !AppUserHasRoleRepo.create(roles.map { AppUserHasRoleRecord(appUser = userId, role = it) })
        return reload(userId)
    }

    private fun TestComprehensionScope<JEnv>.reload(userId: UUID): AppUserWithPrivilegesRecord =
        assertNotNull(!Jooq.query {
            selectFrom(APP_USER_WITH_PRIVILEGES).where(APP_USER_WITH_PRIVILEGES.ID.eq(userId)).fetchOne()
        })

    private fun TestComprehensionScope<JEnv>.provider(name: String): UUID =
        (!MaterialService.addProvider(MaterialProviderRequest(name, null, null, null, null), SYSTEM_USER) as ApiResponse.Created).id

    private fun TestComprehensionScope<JEnv>.roles(userId: UUID): Set<UUID> =
        (!AppUserHasRoleRepo.getRoleIds(userId)).toSet()

    @Test
    fun providerRoleIsNotTheSuperadminRole() {
        assertNotEquals(SUPERADMIN_ROLE, MATERIAL_PROVIDER_ROLE)
        assertEquals(MATERIAL_PROVIDER_ROLE, Job.MaterialProvider.roleId)
    }

    @Test
    fun assigningGrantsExactlyTheProviderRoleAndRevokingTakesOnlyIt() = testComprehension {
        val admin = userWith(Job.Admin.privileges)
        val target = withRoles(listOf(USER_ROLE, Job.Timekeeper.roleId))
        val providerId = provider("Hafen Süd")

        !AppUserService.setMaterialProvider(target.id!!, providerId, admin)

        assertEquals(setOf(USER_ROLE, Job.Timekeeper.roleId, MATERIAL_PROVIDER_ROLE), roles(target.id!!))
        val assigned = reload(target.id!!)
        assertEquals(providerId, assigned.materialProvider)
        assertTrue(assigned.privileges!!.any { it!!.resource == "MATERIAL" && it.scope == "OWN" })
        assertTrue(assigned.privileges!!.none { it!!.resource == "SYSTEM" }, "kein Superadmin-Recht")
        assertTrue(assigned.privileges!!.none { it!!.resource == "MATERIAL" && it.scope == "GLOBAL" })

        !AppUserService.setMaterialProvider(target.id!!, null, admin)

        assertEquals(setOf(USER_ROLE, Job.Timekeeper.roleId), roles(target.id!!))
        val cleared = reload(target.id!!)
        assertNull(cleared.materialProvider)
        assertTrue(cleared.privileges!!.none { it!!.resource == "MATERIAL" })
    }

    @Test
    fun roleSurvivesOrdinaryRoleChanges() = testComprehension {
        val admin = userWith(Job.Admin.privileges)
        val target = withRoles(listOf(USER_ROLE))
        val providerId = provider("Hafen Nord")
        !AppUserService.setMaterialProvider(target.id!!, providerId, admin)

        // Rolle dazu, dann alle verwalteten Rollen weg: die Materialrolle bleibt beide Male stehen.
        !AppUserService.update(
            UpdateAppUserRequest(firstname = "M", lastname = "T", roles = listOf(Job.Judge.roleId)),
            Privilege.Scope.GLOBAL, admin, target.id!!,
        )
        assertEquals(setOf(USER_ROLE, Job.Judge.roleId, MATERIAL_PROVIDER_ROLE), roles(target.id!!))

        !AppUserService.update(
            UpdateAppUserRequest(firstname = "M", lastname = "T", roles = emptyList()),
            Privilege.Scope.GLOBAL, admin, target.id!!,
        )
        assertEquals(setOf(USER_ROLE, MATERIAL_PROVIDER_ROLE), roles(target.id!!))
        assertEquals(providerId, reload(target.id!!).materialProvider)
    }

    @Test
    fun ordinaryRoleManagementCannotGrantTheProviderRole() = testComprehension {
        val admin = userWith(Job.Admin.privileges)
        val target = withRoles(listOf(USER_ROLE))

        // Das Nutzer-Update übergeht die systemverwaltete Rolle, die Einladung weist sie ab.
        !AppUserService.update(
            UpdateAppUserRequest(firstname = "M", lastname = "T", roles = listOf(MATERIAL_PROVIDER_ROLE)),
            Privilege.Scope.GLOBAL, admin, target.id!!,
        )
        assertEquals(setOf(USER_ROLE), roles(target.id!!))

        assertKIOFails(RoleError.CannotAssignRoles(notFound = emptyList(), notAssignable = listOf(MATERIAL_PROVIDER_ROLE))) {
            RoleService.checkAssignable(admin, listOf(MATERIAL_PROVIDER_ROLE), null)
        }
    }

    @Test
    fun updateUserWithoutStaffMayNotAssign() = testComprehension {
        val requester = userWith(listOf(Privilege.ReadUserGlobal, Privilege.UpdateUserGlobal, Privilege.ReadMaterialGlobal, Privilege.UpdateMaterialGlobal))
        val target = withRoles(listOf(USER_ROLE))
        val providerId = provider("Hafen Ost")

        assertKIOFails(AuthError.PrivilegeMissing) {
            AppUserService.setMaterialProvider(target.id!!, providerId, requester)
        }
        assertEquals(setOf(USER_ROLE), roles(target.id!!))
        assertNull(reload(target.id!!).materialProvider)
    }

    @Test
    fun staffWithoutMaterialPrivilegesMayNotAssign() = testComprehension {
        val requester = userWith(listOf(Privilege.UpdateUserGlobal, Privilege.UpdateStaffGlobal, Privilege.ReadRoleGlobal))
        val target = withRoles(listOf(USER_ROLE))
        val providerId = provider("Hafen West")

        assertKIOFails(RoleError.CannotAssignRoles(notFound = emptyList(), notAssignable = listOf(MATERIAL_PROVIDER_ROLE))) {
            AppUserService.setMaterialProvider(target.id!!, providerId, requester)
        }
    }

    @Test
    fun staffCoveringMaterialMayAssignButNotToThemselves() = testComprehension {
        val requester = userWith(listOf(Privilege.UpdateUserGlobal, Privilege.UpdateStaffGlobal, Privilege.ReadMaterialOwn, Privilege.UpdateMaterialOwn))
        val target = withRoles(listOf(USER_ROLE))
        val providerId = provider("Hafen Mitte")

        assertKIOSucceeds { AppUserService.setMaterialProvider(target.id!!, providerId, requester) }
        assertKIOFails(RoleError.SelfAssignment) {
            AppUserService.setMaterialProvider(requester.id!!, providerId, requester)
        }
    }

    @Test
    fun superadminAccountsAndTheSystemAccountAreClosed() = testComprehension {
        val admin = userWith(Job.Admin.privileges)
        val superadmin = withRoles(listOf(USER_ROLE, SUPERADMIN_ROLE))
        val providerId = provider("Hafen Oben")

        assertKIOFails(AuthError.PrivilegeMissing) {
            AppUserService.setMaterialProvider(superadmin.id!!, providerId, admin)
        }
        assertKIOFails(AuthError.PrivilegeMissing) {
            AppUserService.setMaterialProvider(SYSTEM_USER, providerId, admin)
        }
    }

    /** Wechsel A→B: die Vergaberegeln gelten wieder, die Rolle steht danach genau einmal am Konto. */
    @Test
    fun switchingProvidersKeepsExactlyOneRole() = testComprehension {
        val admin = userWith(Job.Admin.privileges)
        val target = withRoles(listOf(USER_ROLE))
        val providerA = provider("Hafen A")
        val providerB = provider("Hafen B")

        !AppUserService.setMaterialProvider(target.id!!, providerA, admin)
        !AppUserService.setMaterialProvider(target.id!!, providerB, admin)

        assertEquals(providerB, reload(target.id!!).materialProvider)
        assertEquals(1, (!AppUserHasRoleRepo.getRoleIds(target.id!!)).count { it == MATERIAL_PROVIDER_ROLE })

        // Ohne Recht auf MATERIAL OWN darf auch der Wechsel nicht laufen.
        val staffOnly = userWith(listOf(Privilege.UpdateUserGlobal, Privilege.UpdateStaffGlobal, Privilege.ReadRoleGlobal))
        assertKIOFails(RoleError.CannotAssignRoles(notFound = emptyList(), notAssignable = listOf(MATERIAL_PROVIDER_ROLE))) {
            AppUserService.setMaterialProvider(target.id!!, providerA, staffOnly)
        }
        assertEquals(providerB, reload(target.id!!).materialProvider)
    }

    /** Die echte Einladung (nicht nur checkAssignable) weist die systemverwaltete Rolle ab. */
    @Test
    fun invitationWithTheProviderRoleIsRejected() = testComprehension {
        val admin = userWith(Job.Admin.privileges)

        assertKIOFails(RoleError.CannotAssignRoles(notFound = emptyList(), notAssignable = listOf(MATERIAL_PROVIDER_ROLE))) {
            AppUserService.invite(
                InviteRequest(
                    email = "eingeladen-${UUID.randomUUID()}@example.org",
                    firstname = "E",
                    lastname = "L",
                    language = EmailLanguage.DE,
                    roles = listOf(MATERIAL_PROVIDER_ROLE),
                    callbackUrl = "http://localhost:5173/invitation",
                ),
                admin,
            )
        }
    }
}
