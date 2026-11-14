package de.lambda9.ready2race.backend.app.role.boundary

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.ServiceError
import de.lambda9.ready2race.backend.app.appuser.control.AppUserHasRoleRepo
import de.lambda9.ready2race.backend.app.auth.control.PrivilegeRepo
import de.lambda9.ready2race.backend.app.auth.entity.AuthError
import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.auth.entity.PrivilegeDto
import de.lambda9.ready2race.backend.app.role.control.RoleHasPrivilegeRepo
import de.lambda9.ready2race.backend.app.role.control.RoleRepo
import de.lambda9.ready2race.backend.app.role.control.toDto
import de.lambda9.ready2race.backend.app.role.entity.*
import de.lambda9.ready2race.backend.calls.requests.covers
import de.lambda9.ready2race.backend.calls.requests.hasPrivilege
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.calls.responses.ApiResponse.Companion.noData
import de.lambda9.ready2race.backend.database.MATERIAL_PROVIDER_ROLE
import de.lambda9.ready2race.backend.database.SUPERADMIN_ROLE
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserWithPrivilegesRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.PrivilegeRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.RoleHasPrivilegeRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.RoleRecord
import de.lambda9.ready2race.backend.pagination.PaginationParameters
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.failIf
import de.lambda9.tailwind.core.extensions.kio.onNullFail
import de.lambda9.tailwind.core.extensions.kio.orDie
import de.lambda9.tailwind.core.extensions.kio.traverse
import java.time.LocalDateTime
import java.util.*

object RoleService {

    /** Welche Scopes eine Rolle der jeweiligen Ebene tragen darf. */
    private fun scopesFor(level: RoleLevel): Set<Privilege.Scope> = when (level) {
        RoleLevel.SELF, RoleLevel.CLUB -> setOf(Privilege.Scope.OWN)
        RoleLevel.EVENT, RoleLevel.ORGANIZER -> setOf(Privilege.Scope.OWN, Privilege.Scope.GLOBAL) // GLOBAL nur bis Schritt 3
        RoleLevel.GLOBAL -> Privilege.Scope.entries.toSet()
    }

    /** Regel 1 für Rollendefinitionen: nur Privilegien vergeben, die man selbst deckt. */
    private fun resolvePrivileges(
        ids: List<UUID>,
        level: RoleLevel,
        requester: AppUserWithPrivilegesRecord,
    ): App<RoleError, List<PrivilegeRecord>> = KIO.comprehension {
        val records = !PrivilegeRepo.getByIds(ids).orDie()
        val unknown = ids.filter { id -> records.none { it.id == id } }
        !KIO.failOn(unknown.isNotEmpty()) { RoleError.PrivilegeUnknown(unknown) }

        val beyond = records.filter { !requester.covers(it) }.map { it.id }
        !KIO.failOn(beyond.isNotEmpty()) { RoleError.PrivilegesBeyondOwn(beyond) }

        val allowed = scopesFor(level)
        !KIO.failOn(records.any { Privilege.Scope.valueOf(it.scope) !in allowed }) {
            RoleError.ScopeNotAllowedForLevel(level)
        }

        KIO.ok(records)
    }

    /**
     * Die im Code definierten Jobs mit ihren Privilegien - die Vorlage, aus der eine eigene
     * Rolle als Kopie entsteht.
     */
    fun jobs(): App<Nothing, ApiResponse.ListDto<JobDto>> = KIO.comprehension {
        val all = !PrivilegeRepo.all().orDie()
        val dtos = Job.entries.map { job ->
            JobDto(
                key = job.key,
                level = job.level.name,
                privileges = job.privileges.map { p ->
                    val record = all.first {
                        it.action == p.action.name && it.resource == p.resource.name && it.scope == p.scope.name
                    }
                    PrivilegeDto(id = record.id, action = record.action, resource = record.resource, scope = record.scope)
                },
            )
        }
        KIO.ok(ApiResponse.ListDto(dtos))
    }

    fun addRole(
        request: RoleRequest,
        requester: AppUserWithPrivilegesRecord,
    ): App<ServiceError, ApiResponse.Created> = KIO.comprehension {
        val jobKey = request.job ?: return@comprehension KIO.fail(RoleError.JobRequired)
        val job = Job.byKey(jobKey) ?: return@comprehension KIO.fail(RoleError.JobUnknown)
        val privileges = !resolvePrivileges(request.privileges, job.level, requester)

        val now = LocalDateTime.now()
        val roleId = !RoleRepo.create(
            RoleRecord(
                id = UUID.randomUUID(),
                name = request.name,
                description = request.description,
                static = false,
                job = job.key,
                level = job.level.name,
                createdAt = now,
                createdBy = requester.id!!,
                updatedAt = now,
                updatedBy = requester.id!!,
            )
        ).orDie()

        !RoleHasPrivilegeRepo.create(privileges.map { RoleHasPrivilegeRecord(role = roleId, privilege = it.id) }).orDie()

        KIO.ok(ApiResponse.Created(roleId))
    }

    fun page(
        params: PaginationParameters<RoleWithPrivilegesSort>,
        requester: AppUserWithPrivilegesRecord,
    ): App<Nothing, ApiResponse.Page<RoleDto, RoleWithPrivilegesSort>> = KIO.comprehension {
        val total = !RoleRepo.countWithPrivileges(params.search).orDie()
        val page = !RoleRepo.pageWithPrivileges(params).orDie()

        page.traverse { it.toDto(requester) }.map {
            ApiResponse.Page(
                data = it,
                pagination = params.toPagination(total)
            )
        }
    }

    fun updateRole(
        id: UUID,
        request: RoleRequest,
        requester: AppUserWithPrivilegesRecord,
    ): App<ServiceError, ApiResponse.NoData> = KIO.comprehension {
        val record = !RoleRepo.get(id).orDie()
            .onNullFail { RoleError.NotFound }
            .failIf(condition = { it.static }) { RoleError.Static }
        val level = RoleLevel.valueOf(record.level!!) // not null in der Datenbank

        // Regel 1 gilt auch für den Ist-Zustand: wer ändert, muss auch die bisherigen
        // Privilegien der Rolle selbst decken – sonst könnte man sich fremde Privilegien
        // durch bloßes Stehenlassen "leihen".
        val existing = !RoleHasPrivilegeRepo.getPrivilegeRecordsByRoles(listOf(id)).orDie()
        val existingBeyond = (existing[id] ?: emptyList()).filter { !requester.covers(it) }.map { it.id }
        !KIO.failOn(existingBeyond.isNotEmpty()) { RoleError.PrivilegesBeyondOwn(existingBeyond) }

        val privileges = !resolvePrivileges(request.privileges, level, requester)

        !RoleRepo.update(record) {
            name = request.name
            description = request.description
            updatedAt = LocalDateTime.now()
            updatedBy = requester.id!!
        }.orDie()

        !RoleHasPrivilegeRepo.deleteByRole(id).orDie()
        !RoleHasPrivilegeRepo.create(privileges.map { RoleHasPrivilegeRecord(role = id, privilege = it.id) }).orDie()

        noData
    }

    fun deleteRole(
        id: UUID,
        requester: AppUserWithPrivilegesRecord,
    ): App<ServiceError, ApiResponse.NoData> = KIO.comprehension {
        val record = !RoleRepo.get(id).orDie()
            .onNullFail { RoleError.NotFound }
            .failIf(condition = { it.static }) { RoleError.Static }

        // Wer löscht, muss die Privilegien der Rolle ebenfalls decken (Spec 7.1 Regel 1).
        val existing = !RoleHasPrivilegeRepo.getPrivilegeRecordsByRoles(listOf(id)).orDie()
        val beyond = (existing[id] ?: emptyList()).filter { !requester.covers(it) }.map { it.id }
        !KIO.failOn(beyond.isNotEmpty()) { RoleError.PrivilegesBeyondOwn(beyond) }

        record.delete() // todo: @style  -> Repo

        noData
    }

    /**
     * Die drei Vergaberegeln. [targetUserId] ist null bei Einladungen (das Konto gibt es noch nicht).
     *  1. Jede Rolle nur, wenn der Aufrufende all ihre Privilegien selbst deckt.
     *  2. Nicht an sich selbst.
     *  3. Konten mit Superadmin-Rolle nur, wenn der Aufrufende UPDATE SYSTEM trägt.
     *
     * Eine leere Rollenliste ist fachlich keine Vergabe – "null Rollen zuweisen" ändert nichts
     * an der bestehenden Zuweisung, also greift keine der drei Regeln und `UPDATE STAFF GLOBAL`
     * wird dafür nicht verlangt.
     */
    fun checkAssignable(
        requester: AppUserWithPrivilegesRecord,
        roles: List<UUID>,
        targetUserId: UUID?,
    ): App<ServiceError, Unit> = KIO.comprehension {
        if (roles.isEmpty()) {
            return@comprehension KIO.unit
        }

        // Die Materialanbieter-Rolle vergibt allein die Anbieter-Zuordnung; über die
        // Rollenverwaltung (Nutzer-Update, Einladung) ließe sie sich sonst ohne Anbieter vergeben.
        val systemManaged = roles.filter { it == MATERIAL_PROVIDER_ROLE }
        !KIO.failOn(systemManaged.isNotEmpty()) { RoleError.CannotAssignRoles(emptyList(), systemManaged) }

        checkRules(requester, roles, targetUserId)
    }

    /**
     * Dieselben drei Vergaberegeln für eine systemverwaltete Rolle, die ein eigener Ablauf
     * vergibt und entzieht (die Materialanbieter-Rolle über die Anbieter-Zuordnung). Gilt für
     * Vergeben und Entziehen gleichermaßen.
     */
    fun checkSystemManagedAssignable(
        requester: AppUserWithPrivilegesRecord,
        role: UUID,
        targetUserId: UUID,
    ): App<ServiceError, Unit> = checkRules(requester, listOf(role), targetUserId)

    private fun checkRules(
        requester: AppUserWithPrivilegesRecord,
        roles: List<UUID>,
        targetUserId: UUID?,
    ): App<ServiceError, Unit> = KIO.comprehension {
        !KIO.failOn(!requester.hasPrivilege(Privilege.UpdateStaffGlobal)) { AuthError.PrivilegeMissing }
        !KIO.failOn(targetUserId != null && targetUserId == requester.id) { RoleError.SelfAssignment }

        if (targetUserId != null) {
            val targetIsSuperadmin = !AppUserHasRoleRepo.exists(targetUserId, SUPERADMIN_ROLE).orDie()
            !KIO.failOn(targetIsSuperadmin && !requester.hasPrivilege(Privilege.UpdateSystemGlobal)) {
                AuthError.PrivilegeMissing
            }
        }

        val found = !RoleRepo.getIfExist(roles).orDie()
        val notFound = roles.filter { id -> found.none { it.id == id } }
        val privilegesByRole = !RoleHasPrivilegeRepo.getPrivilegeRecordsByRoles(found.map { it.id }).orDie()
        val notAssignable = found
            .filter { role -> (privilegesByRole[role.id] ?: emptyList()).any { !requester.covers(it) } }
            .map { it.id }

        if (notFound.isNotEmpty() || notAssignable.isNotEmpty()) {
            KIO.fail(RoleError.CannotAssignRoles(notFound, notAssignable))
        } else {
            KIO.unit
        }
    }
}
