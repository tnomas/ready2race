package de.lambda9.ready2race.backend.app.material

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.appuser.control.AppUserRepo
import de.lambda9.ready2race.backend.app.material.boundary.MaterialService
import de.lambda9.ready2race.backend.app.material.entity.MaterialCategory
import de.lambda9.ready2race.backend.app.material.entity.MaterialError
import de.lambda9.ready2race.backend.app.material.entity.MaterialItemRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialItemStatus
import de.lambda9.ready2race.backend.app.material.entity.MaterialProviderRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialTypeRequest
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserRecord
import de.lambda9.ready2race.backend.pagination.PaginationParameters
import de.lambda9.ready2race.testing.testComprehension
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.orDie
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals

class MaterialServiceTest {

    private fun createTestUser(): App<Nothing, UUID> = KIO.comprehension {
        val now = LocalDateTime.now()
        val id = UUID.randomUUID()
        !AppUserRepo.create(AppUserRecord(id = id, email = "m-$id@test.de", password = "x", firstname = "M", lastname = "T",
            language = "de", createdAt = now, updatedAt = now)).orDie()
        KIO.ok(id)
    }

    private fun provider(name: String = "Bootshaus Nord") =
        MaterialProviderRequest(name = name, contactName = null, contactEmail = "info@nord.de", contactPhone = null, note = null)

    @Test
    fun providerTypeItemRoundTrip() = testComprehension {
        val userId = !createTestUser()
        val providerId = (!MaterialService.addProvider(provider(), userId) as ApiResponse.Created).id
        val typeId = (!MaterialService.addType(MaterialTypeRequest("C4x+", MaterialCategory.BOAT, null), userId) as ApiResponse.Created).id
        val itemId = (!MaterialService.addItem(providerId, MaterialItemRequest(typeId, 7, "Boot 7", null, MaterialItemStatus.ACTIVE), userId) as ApiResponse.Created).id

        val page = !MaterialService.pageItems(providerId, PaginationParameters(null, null, null, null))
        val item = page.data.single { it.id == itemId }
        assertEquals("C4x+", item.materialTypeName)
        assertEquals(MaterialCategory.BOAT, item.category)
        assertEquals(7, item.number)
        assertEquals(0, item.openDamages)
    }

    @Test
    fun duplicateNumberPerTypeIsRejected() = testComprehension {
        val userId = !createTestUser()
        val providerId = (!MaterialService.addProvider(provider(), userId) as ApiResponse.Created).id
        val typeId = (!MaterialService.addType(MaterialTypeRequest("C1x", MaterialCategory.BOAT, null), userId) as ApiResponse.Created).id
        !MaterialService.addItem(providerId, MaterialItemRequest(typeId, 3, "Boot 3", null, MaterialItemStatus.ACTIVE), userId)
        assertKIOFails(MaterialError.ItemNumberTaken) {
            MaterialService.addItem(providerId, MaterialItemRequest(typeId, 3, "Boot 3b", null, MaterialItemStatus.ACTIVE), userId)
        }
    }

    @Test
    fun typeInUseCannotBeDeleted() = testComprehension {
        val userId = !createTestUser()
        val providerId = (!MaterialService.addProvider(provider(), userId) as ApiResponse.Created).id
        val typeId = (!MaterialService.addType(MaterialTypeRequest("C2x", MaterialCategory.BOAT, null), userId) as ApiResponse.Created).id
        !MaterialService.addItem(providerId, MaterialItemRequest(typeId, null, "Zweier", null, MaterialItemStatus.ACTIVE), userId)
        assertKIOFails(MaterialError.TypeInUse) { MaterialService.deleteType(typeId) }
    }

    @Test
    fun providerNameMustBeUnique() = testComprehension {
        val userId = !createTestUser()
        !MaterialService.addProvider(provider(), userId)
        assertKIOFails(MaterialError.ProviderNameTaken) { MaterialService.addProvider(provider(), userId) }
    }
}
