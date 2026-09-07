package de.lambda9.ready2race.backend.app.role.entity

import de.lambda9.ready2race.backend.app.auth.entity.PrivilegeDto
import java.util.UUID

/**
 * [assignable] sagt, ob der Abrufende diese Rolle vergeben darf - also alle ihre Privilegien
 * selbst deckt. Wo kein Abrufender bekannt ist (Rollen an einem Konto), steht dort `false`.
 */
data class RoleDto(
    val id: UUID,
    val name: String,
    val description: String?,
    val static: Boolean,
    val job: String?,
    val level: String,
    val assignable: Boolean,
    val privileges: List<PrivilegeDto>
)
