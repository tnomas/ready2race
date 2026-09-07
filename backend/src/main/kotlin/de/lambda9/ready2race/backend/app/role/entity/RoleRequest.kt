package de.lambda9.ready2race.backend.app.role.entity

import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult
import de.lambda9.ready2race.backend.validation.validate
import de.lambda9.ready2race.backend.validation.validators.CollectionValidators.noDuplicates
import de.lambda9.ready2race.backend.validation.validators.StringValidators.notBlank
import java.util.*

/**
 * [job] ist der Schlüssel des Jobs, dessen Kopie die Rolle wird. Beim Anlegen Pflicht, beim
 * Ändern ohne Wirkung: der Job einer Rolle steht fest.
 */
data class RoleRequest(
    val name: String,
    val description: String?,
    val privileges: List<UUID>,
    val job: String? = null,
): Validatable {
    override fun validate(): ValidationResult =
        ValidationResult.allOf(
            this::name validate notBlank,
            this::description validate notBlank,
            this::privileges validate noDuplicates
        )

    companion object {
        val example get() = RoleRequest(
            name = "role #42",
            description = null,
            privileges = listOf(
                UUID.randomUUID(),
                UUID.randomUUID(),
            ),
            job = "TIMEKEEPER",
        )
    }
}
