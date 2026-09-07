package de.lambda9.ready2race.backend.app.auth.entity

import java.util.*

data class LoginDto(
    val id: UUID,
    val clubId: UUID?,
    val materialProviderId: UUID?,
    val privileges: List<PrivilegeDto>,
)
