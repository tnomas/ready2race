package de.lambda9.ready2race.backend.app.role.boundary

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.auth.control.PrivilegeRepo
import de.lambda9.ready2race.backend.app.role.control.RoleHasPrivilegeRepo
import de.lambda9.ready2race.backend.app.role.control.RoleRepo
import de.lambda9.ready2race.backend.app.role.entity.Job
import de.lambda9.ready2race.backend.database.SYSTEM_USER
import de.lambda9.ready2race.backend.database.generated.tables.records.RoleHasPrivilegeRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.RoleRecord
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.orDie
import java.time.LocalDateTime
import java.util.UUID

/**
 * Sät die Jobs als statische Rollen und hält sie synchron:
 *  - statische Rollen tragen exakt die Privilegien ihres Jobs (Fehlendes kommt dazu, Überzähliges geht weg),
 *  - Kopien (static = false, job gesetzt) bekommen neue Job-Privilegien nachgetragen, behalten aber
 *    ihre Abweichungen.
 *
 * Läuft bei jedem Start aus initializeDatabase und ist idempotent.
 */
object JobSeeder {

    fun sync(now: LocalDateTime): App<Nothing, Unit> = KIO.comprehension {
        val all = !PrivilegeRepo.all().orDie()
        val byTriple = all.associateBy { Triple(it.action, it.resource, it.scope) }

        Job.entries.forEach { job ->
            val wanted = job.privileges.map { p ->
                byTriple[Triple(p.action.name, p.resource.name, p.scope.name)]?.id
                    ?: error("Privileg ${p.action} ${p.resource} ${p.scope} fehlt in der Datenbank")
            }.toSet()

            !ensureStaticRole(job, now)
            !syncExact(job.roleId, wanted)

            val copies = !RoleRepo.getByJob(job.key).orDie()
            copies.filter { !it.static }.forEach { copy ->
                !addMissing(copy.id, wanted)
            }
        }

        KIO.unit
    }

    // Parameter heißt bewusst nicht `job`: im Update-Lambda ist `job` das Feld des RoleRecord,
    // und ein gleichnamiger Funktionsparameter würde es verdecken.
    private fun ensureStaticRole(definition: Job, now: LocalDateTime): App<Nothing, Unit> = KIO.comprehension {
        val key = definition.key
        val levelName = definition.level.name
        val existing = !RoleRepo.get(definition.roleId).orDie()
        if (existing == null) {
            !RoleRepo.create(
                RoleRecord(
                    id = definition.roleId,
                    name = definition.defaultName,
                    description = null,
                    static = true,
                    job = key,
                    level = levelName,
                    createdAt = now,
                    createdBy = SYSTEM_USER,
                    updatedAt = now,
                    updatedBy = SYSTEM_USER,
                )
            ).orDie()
        } else if (existing.job != key || existing.level != levelName || !existing.static) {
            !RoleRepo.update(existing) {
                job = key
                level = levelName
                static = true
                updatedAt = now
                updatedBy = SYSTEM_USER
            }.orDie()
        }
        KIO.unit
    }

    private fun syncExact(roleId: UUID, wanted: Set<UUID>): App<Nothing, Unit> = KIO.comprehension {
        val current = (!RoleHasPrivilegeRepo.getPrivilegesByRole(roleId).orDie()).toSet()
        val missing = wanted - current
        val stray = current - wanted
        if (missing.isNotEmpty()) {
            !RoleHasPrivilegeRepo.create(missing.map { RoleHasPrivilegeRecord(role = roleId, privilege = it) }).orDie()
        }
        if (stray.isNotEmpty()) {
            !RoleHasPrivilegeRepo.delete(roleId, stray).orDie()
        }
        KIO.unit
    }

    private fun addMissing(roleId: UUID, wanted: Set<UUID>): App<Nothing, Unit> = KIO.comprehension {
        val current = (!RoleHasPrivilegeRepo.getPrivilegesByRole(roleId).orDie()).toSet()
        val missing = wanted - current
        if (missing.isNotEmpty()) {
            !RoleHasPrivilegeRepo.create(missing.map { RoleHasPrivilegeRecord(role = roleId, privilege = it) }).orDie()
        }
        KIO.unit
    }
}
