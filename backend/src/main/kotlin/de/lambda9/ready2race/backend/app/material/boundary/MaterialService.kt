package de.lambda9.ready2race.backend.app.material.boundary

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.material.control.MaterialItemRepo
import de.lambda9.ready2race.backend.app.material.control.MaterialProviderRepo
import de.lambda9.ready2race.backend.app.material.control.MaterialTypeRepo
import de.lambda9.ready2race.backend.app.material.control.toDto
import de.lambda9.ready2race.backend.app.material.control.toRecord
import de.lambda9.ready2race.backend.app.material.entity.MaterialError
import de.lambda9.ready2race.backend.app.material.entity.MaterialItemDto
import de.lambda9.ready2race.backend.app.material.entity.MaterialItemRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialItemSort
import de.lambda9.ready2race.backend.app.material.entity.MaterialProviderDto
import de.lambda9.ready2race.backend.app.material.entity.MaterialProviderRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialProviderSort
import de.lambda9.ready2race.backend.app.material.entity.MaterialTypeDto
import de.lambda9.ready2race.backend.app.material.entity.MaterialTypeRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialTypeSort
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.calls.responses.ApiResponse.Companion.noData
import de.lambda9.ready2race.backend.calls.responses.createdResponse
import de.lambda9.ready2race.backend.calls.responses.pageResponse
import de.lambda9.ready2race.backend.kio.onFalseFail
import de.lambda9.ready2race.backend.pagination.PaginationParameters
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.onNullFail
import de.lambda9.tailwind.core.extensions.kio.orDie
import java.time.LocalDateTime
import java.util.UUID

/**
 * Anbieter, Materialarten und die Stücke im Bestand eines Anbieters - der Stamm der
 * Materialvermietung. Angebote, Anfragen und Schäden folgen in späteren Aufgaben.
 */
object MaterialService {

    // -------------------------------------------------------------------
    // Anbieter
    // -------------------------------------------------------------------

    fun addProvider(
        request: MaterialProviderRequest,
        userId: UUID,
    ): App<MaterialError, ApiResponse.Created> = KIO.comprehension {
        val nameTaken = !MaterialProviderRepo.existsByName(request.name).orDie()
        !KIO.failOn(nameTaken) { MaterialError.ProviderNameTaken }

        val record = !request.toRecord(userId)
        MaterialProviderRepo.create(record).orDie().createdResponse()
    }

    fun pageProviders(
        params: PaginationParameters<MaterialProviderSort>,
    ): App<Nothing, ApiResponse.Page<MaterialProviderDto, MaterialProviderSort>> = KIO.comprehension {
        MaterialProviderRepo.page(params).orDie().pageResponse { !it.toDto() }
    }

    fun getProvider(
        id: UUID,
    ): App<MaterialError, ApiResponse.Dto<MaterialProviderDto>> = KIO.comprehension {
        val record = !MaterialProviderRepo.get(id).orDie().onNullFail { MaterialError.ProviderNotFound }
        record.toDto().map { ApiResponse.Dto(it) }
    }

    fun updateProvider(
        id: UUID,
        request: MaterialProviderRequest,
        userId: UUID,
    ): App<MaterialError, ApiResponse.NoData> = KIO.comprehension {
        val nameTaken = !MaterialProviderRepo.existsByName(request.name, excludingId = id).orDie()
        !KIO.failOn(nameTaken) { MaterialError.ProviderNameTaken }

        !MaterialProviderRepo.update(id) {
            name = request.name
            contactName = request.contactName
            contactEmail = request.contactEmail
            contactPhone = request.contactPhone
            note = request.note
            updatedAt = LocalDateTime.now()
            updatedBy = userId
        }.orDie().onNullFail { MaterialError.ProviderNotFound }
        noData
    }

    fun deleteProvider(
        id: UUID,
    ): App<MaterialError, ApiResponse.NoData> = KIO.comprehension {
        val hasItems = !MaterialProviderRepo.hasItems(id).orDie()
        !KIO.failOn(hasItems) { MaterialError.ProviderInUse }
        val hasInvitations = !MaterialProviderRepo.hasEventInvitations(id).orDie()
        !KIO.failOn(hasInvitations) { MaterialError.ProviderInUse }

        val deleted = !MaterialProviderRepo.delete(id).orDie()
        if (deleted < 1) {
            KIO.fail(MaterialError.ProviderNotFound)
        } else {
            noData
        }
    }

    // -------------------------------------------------------------------
    // Materialarten
    // -------------------------------------------------------------------

    fun addType(
        request: MaterialTypeRequest,
        userId: UUID,
    ): App<MaterialError, ApiResponse.Created> = KIO.comprehension {
        val nameTaken = !MaterialTypeRepo.existsByName(request.name).orDie()
        !KIO.failOn(nameTaken) { MaterialError.TypeNameTaken }

        val record = !request.toRecord(userId)
        MaterialTypeRepo.create(record).orDie().createdResponse()
    }

    fun pageTypes(
        params: PaginationParameters<MaterialTypeSort>,
    ): App<Nothing, ApiResponse.Page<MaterialTypeDto, MaterialTypeSort>> = KIO.comprehension {
        MaterialTypeRepo.page(params).orDie().pageResponse { !it.toDto() }
    }

    fun updateType(
        id: UUID,
        request: MaterialTypeRequest,
        userId: UUID,
    ): App<MaterialError, ApiResponse.NoData> = KIO.comprehension {
        val nameTaken = !MaterialTypeRepo.existsByName(request.name, excludingId = id).orDie()
        !KIO.failOn(nameTaken) { MaterialError.TypeNameTaken }

        !MaterialTypeRepo.update(id) {
            name = request.name
            category = request.category.name
            description = request.description
            updatedAt = LocalDateTime.now()
            updatedBy = userId
        }.orDie().onNullFail { MaterialError.TypeNotFound }
        noData
    }

    fun deleteType(
        id: UUID,
    ): App<MaterialError, ApiResponse.NoData> = KIO.comprehension {
        val hasItems = !MaterialTypeRepo.hasItems(id).orDie()
        !KIO.failOn(hasItems) { MaterialError.TypeInUse }
        val hasDemand = !MaterialTypeRepo.hasCompetitionDemand(id).orDie()
        !KIO.failOn(hasDemand) { MaterialError.TypeInUse }
        val hasOffers = !MaterialTypeRepo.hasOffers(id).orDie()
        !KIO.failOn(hasOffers) { MaterialError.TypeInUse }

        val deleted = !MaterialTypeRepo.delete(id).orDie()
        if (deleted < 1) {
            KIO.fail(MaterialError.TypeNotFound)
        } else {
            noData
        }
    }

    // -------------------------------------------------------------------
    // Materialstücke
    // -------------------------------------------------------------------

    fun addItem(
        providerId: UUID,
        request: MaterialItemRequest,
        userId: UUID,
    ): App<MaterialError, ApiResponse.Created> = KIO.comprehension {
        if (request.number != null) {
            val numberTaken = !MaterialItemRepo.existsByNumber(providerId, request.materialType, request.number).orDie()
            !KIO.failOn(numberTaken) { MaterialError.ItemNumberTaken }
        }

        val record = !request.toRecord(providerId, userId)
        MaterialItemRepo.create(record).orDie().createdResponse()
    }

    fun pageItems(
        providerId: UUID,
        params: PaginationParameters<MaterialItemSort>,
    ): App<Nothing, ApiResponse.Page<MaterialItemDto, MaterialItemSort>> = KIO.comprehension {
        MaterialItemRepo.page(providerId, params).orDie().pageResponse { !it.toDto() }
    }

    fun updateItem(
        providerId: UUID,
        itemId: UUID,
        request: MaterialItemRequest,
        userId: UUID,
    ): App<MaterialError, ApiResponse.NoData> = KIO.comprehension {
        val item = !MaterialItemRepo.get(itemId).orDie().onNullFail { MaterialError.ItemNotFound }
        !KIO.ok(item.materialProvider == providerId).onFalseFail { MaterialError.ItemNotFound }

        if (request.number != null) {
            val numberTaken = !MaterialItemRepo.existsByNumber(
                providerId,
                request.materialType,
                request.number,
                excludingId = itemId,
            ).orDie()
            !KIO.failOn(numberTaken) { MaterialError.ItemNumberTaken }
        }

        !MaterialItemRepo.update(itemId) {
            materialType = request.materialType
            number = request.number
            label = request.label
            note = request.note
            status = request.status.name
            updatedAt = LocalDateTime.now()
            updatedBy = userId
        }.orDie().onNullFail { MaterialError.ItemNotFound }
        noData
    }

    fun deleteItem(
        providerId: UUID,
        itemId: UUID,
    ): App<MaterialError, ApiResponse.NoData> = KIO.comprehension {
        val item = !MaterialItemRepo.get(itemId).orDie().onNullFail { MaterialError.ItemNotFound }
        !KIO.ok(item.materialProvider == providerId).onFalseFail { MaterialError.ItemNotFound }

        val hasAssignments = !MaterialItemRepo.hasAssignments(itemId).orDie()
        !KIO.failOn(hasAssignments) { MaterialError.ItemInUse }

        val deleted = !MaterialItemRepo.delete(itemId).orDie()
        if (deleted < 1) {
            KIO.fail(MaterialError.ItemNotFound)
        } else {
            noData
        }
    }
}
