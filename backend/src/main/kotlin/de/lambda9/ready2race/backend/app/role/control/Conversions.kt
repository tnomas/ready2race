package de.lambda9.ready2race.backend.app.role.control

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.auth.control.toPrivilegeDto
import de.lambda9.ready2race.backend.app.role.entity.RoleDto
import de.lambda9.ready2race.backend.calls.requests.covers
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserWithPrivilegesRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.EveryRoleWithPrivilegesRecord
import de.lambda9.tailwind.core.extensions.kio.traverse

/**
 * [requester] ist der Abrufende, an dem `assignable` hängt. Wo die Rolle ohne Vergabe-Absicht
 * ausgegeben wird - etwa als Rolle an einem Konto - bleibt er null und `assignable` ist `false`.
 */
fun EveryRoleWithPrivilegesRecord.toDto(
    requester: AppUserWithPrivilegesRecord? = null,
): App<Nothing, RoleDto> =
    privileges!!.toList().traverse { it!!.toPrivilegeDto() }.map { dtos ->
        RoleDto(
            id = id!!,
            name = name!!,
            description = description,
            static = static!!,
            job = job,
            level = level!!,
            assignable = requester != null && privileges!!.all { requester.covers(it!!) },
            privileges = dtos,
        )
    }
