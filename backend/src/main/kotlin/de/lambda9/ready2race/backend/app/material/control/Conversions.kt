package de.lambda9.ready2race.backend.app.material.control

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.material.entity.MaterialCategory
import de.lambda9.ready2race.backend.app.material.entity.MaterialItemDto
import de.lambda9.ready2race.backend.app.material.entity.MaterialItemRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialItemStatus
import de.lambda9.ready2race.backend.app.material.entity.MaterialOfferRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialProviderDto
import de.lambda9.ready2race.backend.app.material.entity.MaterialProviderRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialTypeDto
import de.lambda9.ready2race.backend.app.material.entity.MaterialTypeRequest
import de.lambda9.ready2race.backend.database.generated.tables.records.MaterialItemRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.MaterialItemViewRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.MaterialOfferRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.MaterialProviderRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.MaterialTypeRecord
import de.lambda9.tailwind.core.KIO
import java.time.LocalDateTime
import java.util.UUID

fun MaterialProviderRequest.toRecord(userId: UUID): App<Nothing, MaterialProviderRecord> = KIO.ok(
    LocalDateTime.now().let { now ->
        MaterialProviderRecord(
            id = UUID.randomUUID(),
            name = name,
            contactName = contactName,
            contactEmail = contactEmail,
            contactPhone = contactPhone,
            note = note,
            createdAt = now,
            createdBy = userId,
            updatedAt = now,
            updatedBy = userId,
        )
    }
)

fun MaterialProviderRecord.toDto(): App<Nothing, MaterialProviderDto> = KIO.ok(
    MaterialProviderDto(
        id = id,
        name = name,
        contactName = contactName,
        contactEmail = contactEmail,
        contactPhone = contactPhone,
        note = note,
    )
)

fun MaterialTypeRequest.toRecord(userId: UUID): App<Nothing, MaterialTypeRecord> = KIO.ok(
    LocalDateTime.now().let { now ->
        MaterialTypeRecord(
            id = UUID.randomUUID(),
            name = name,
            category = category.name,
            description = description,
            createdAt = now,
            createdBy = userId,
            updatedAt = now,
            updatedBy = userId,
        )
    }
)

fun MaterialTypeRecord.toDto(): App<Nothing, MaterialTypeDto> = KIO.ok(
    MaterialTypeDto(
        id = id,
        name = name,
        category = MaterialCategory.valueOf(category),
        description = description,
    )
)

fun MaterialItemRequest.toRecord(providerId: UUID, userId: UUID): App<Nothing, MaterialItemRecord> = KIO.ok(
    LocalDateTime.now().let { now ->
        MaterialItemRecord(
            id = UUID.randomUUID(),
            materialProvider = providerId,
            materialType = materialType,
            number = number,
            label = label,
            note = note,
            status = status.name,
            createdAt = now,
            createdBy = userId,
            updatedAt = now,
            updatedBy = userId,
        )
    }
)

fun MaterialItemViewRecord.toDto(): App<Nothing, MaterialItemDto> = KIO.ok(
    MaterialItemDto(
        id = id!!,
        materialProvider = materialProvider!!,
        materialProviderName = materialProviderName!!,
        materialType = materialType!!,
        materialTypeName = materialTypeName!!,
        category = MaterialCategory.valueOf(category!!),
        number = number,
        label = label!!,
        note = note,
        status = MaterialItemStatus.valueOf(status!!),
        openDamages = openDamages!!,
    )
)

fun MaterialOfferRequest.toRecord(eventId: UUID, providerId: UUID, userId: UUID): App<Nothing, MaterialOfferRecord> = KIO.ok(
    LocalDateTime.now().let { now ->
        MaterialOfferRecord(
            id = UUID.randomUUID(),
            event = eventId,
            materialProvider = providerId,
            materialType = materialType,
            priceText = priceText,
            plannedCount = plannedCount,
            changeoverMinutes = changeoverMinutes,
            createdAt = now,
            createdBy = userId,
            updatedAt = now,
            updatedBy = userId,
        )
    }
)
