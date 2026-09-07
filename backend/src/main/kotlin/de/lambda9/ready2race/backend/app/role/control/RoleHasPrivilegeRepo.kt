package de.lambda9.ready2race.backend.app.role.control

import de.lambda9.ready2race.backend.database.*
import de.lambda9.ready2race.backend.database.generated.tables.records.PrivilegeRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.RoleHasPrivilegeRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.PRIVILEGE
import de.lambda9.ready2race.backend.database.generated.tables.references.ROLE_HAS_PRIVILEGE
import de.lambda9.tailwind.jooq.JIO
import de.lambda9.tailwind.jooq.Jooq
import org.jooq.impl.DSL
import java.util.*

object RoleHasPrivilegeRepo {

    fun create(records: List<RoleHasPrivilegeRecord>) = ROLE_HAS_PRIVILEGE.insert(records)

    fun deleteByRole(roleId: UUID) = ROLE_HAS_PRIVILEGE.delete { ROLE.eq(roleId) }

    fun delete(roleId: UUID, privilegeIds: Collection<UUID>) = ROLE_HAS_PRIVILEGE.delete {
        ROLE.eq(roleId).and(PRIVILEGE.`in`(privilegeIds))
    }

    fun getPrivilegesByRole(
        roleId: UUID,
    ): JIO<List<UUID>> = Jooq.query {
        with(ROLE_HAS_PRIVILEGE) {
            select(PRIVILEGE)
                .from(this)
                .where(ROLE.eq(roleId))
                .fetch { it.value1() }
        }
    }

    /** Privilegien-Datensätze je Rolle - für die Prüfung, ob der Vergebende sie selbst deckt. */
    fun getPrivilegeRecordsByRoles(roleIds: Collection<UUID>): JIO<Map<UUID, List<PrivilegeRecord>>> = Jooq.query {
        select(ROLE_HAS_PRIVILEGE.ROLE, PRIVILEGE.asterisk())
            .from(ROLE_HAS_PRIVILEGE)
            .join(PRIVILEGE).on(PRIVILEGE.ID.eq(ROLE_HAS_PRIVILEGE.PRIVILEGE))
            .where(ROLE_HAS_PRIVILEGE.ROLE.`in`(roleIds))
            .fetchGroups({ it.get(ROLE_HAS_PRIVILEGE.ROLE)!! }, { it.into(PRIVILEGE) })
    }

    fun getByRolesAsJson(roles: List<UUID>) = ROLE_HAS_PRIVILEGE.selectAsJson { ROLE.`in`(roles) }

    fun getOverlaps(ids: List<Pair<UUID, UUID>>) = ROLE_HAS_PRIVILEGE.select {
        DSL.or(ids.map { (roleId, privilegeId) ->
            ROLE.eq(roleId).and(PRIVILEGE.eq(privilegeId))
        })
    }

    fun parseJsonToRecord(data: String) = ROLE_HAS_PRIVILEGE.parseJsonToRecords(data)


}