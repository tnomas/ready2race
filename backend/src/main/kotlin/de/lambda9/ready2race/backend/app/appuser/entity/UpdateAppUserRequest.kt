package de.lambda9.ready2race.backend.app.appuser.entity

import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult
import de.lambda9.ready2race.backend.validation.validate
import de.lambda9.ready2race.backend.validation.validators.CollectionValidators.noDuplicates
import de.lambda9.ready2race.backend.validation.validators.StringValidators.notBlank
import java.util.*

data class UpdateAppUserRequest(
    val firstname: String,
    val lastname: String,
    // roles == null heißt: Rollen bleiben, wie sie sind (Formulare ohne Rollenauswahl).
    val roles: List<UUID>? = null,
) : Validatable {
    override fun validate(): ValidationResult =
        ValidationResult.allOf(
            this::firstname validate notBlank,
            this::lastname validate notBlank,
            this::roles validate noDuplicates,
        )

    companion object {
        val example
            get() = UpdateAppUserRequest(
                firstname = "John",
                lastname = "Doe",
                roles = listOf(UUID.randomUUID())
            )
    }
}
