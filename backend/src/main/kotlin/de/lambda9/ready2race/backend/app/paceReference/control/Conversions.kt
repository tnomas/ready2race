package de.lambda9.ready2race.backend.app.paceReference.control

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.paceReference.entity.PaceReferenceDto
import de.lambda9.ready2race.backend.app.paceReference.entity.PaceReferenceMode
import de.lambda9.ready2race.backend.app.paceReference.entity.PaceReferenceRequest
import de.lambda9.ready2race.backend.database.generated.tables.records.PaceReferenceRecord
import de.lambda9.tailwind.core.KIO
import java.time.LocalDateTime
import java.util.UUID

fun PaceReferenceRequest.toRecord(userId: UUID): App<Nothing, PaceReferenceRecord> = KIO.ok(
    LocalDateTime.now().let { now ->
        PaceReferenceRecord(
            id = UUID.randomUUID(),
            name = name,
            mode = mode.name,
            referenceMeters = referenceMeters,
            createdAt = now,
            createdBy = userId,
            updatedAt = now,
            updatedBy = userId,
        )
    }
)

fun PaceReferenceRecord.toDto(): App<Nothing, PaceReferenceDto> = KIO.ok(
    PaceReferenceDto(
        id = id,
        name = name,
        mode = PaceReferenceMode.valueOf(mode),
        referenceMeters = referenceMeters,
    )
)
