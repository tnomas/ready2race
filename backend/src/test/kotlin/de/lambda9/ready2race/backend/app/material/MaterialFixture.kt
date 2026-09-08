package de.lambda9.ready2race.backend.app.material

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.appuser.control.AppUserRepo
import de.lambda9.ready2race.backend.app.material.entity.MaterialProviderRequest
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserRecord
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.orDie
import java.time.LocalDateTime
import java.util.UUID

/** Gemeinsame Fixtures der Material-Tests - ein Nutzer ohne Rechte und ein Anbieter-Rohling. */
fun createTestUser(): App<Nothing, UUID> = KIO.comprehension {
    val now = LocalDateTime.now()
    val id = UUID.randomUUID()
    !AppUserRepo.create(
        AppUserRecord(
            id = id,
            email = "m-$id@test.de",
            password = "x",
            firstname = "M",
            lastname = "T",
            language = "de",
            createdAt = now,
            updatedAt = now,
        )
    ).orDie()
    KIO.ok(id)
}

fun provider(name: String = "Bootshaus Nord") =
    MaterialProviderRequest(name = name, contactName = null, contactEmail = "info@nord.de", contactPhone = null, note = null)
