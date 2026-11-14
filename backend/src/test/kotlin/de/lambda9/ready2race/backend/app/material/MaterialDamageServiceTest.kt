package de.lambda9.ready2race.backend.app.material

import de.lambda9.ready2race.backend.app.JEnv
import de.lambda9.ready2race.backend.app.eventRegistration.boundary.EventRegistrationService
import de.lambda9.ready2race.backend.app.material.boundary.MATERIAL_PHOTO_MAX_BYTES
import de.lambda9.ready2race.backend.app.material.boundary.MaterialService
import de.lambda9.ready2race.backend.app.material.control.MaterialOverviewRepo
import de.lambda9.ready2race.backend.app.material.entity.MaterialCategory
import de.lambda9.ready2race.backend.app.material.entity.MaterialDamageRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialDamageSeverity
import de.lambda9.ready2race.backend.app.material.entity.MaterialDamageSort
import de.lambda9.ready2race.backend.app.material.entity.MaterialDamageStatus
import de.lambda9.ready2race.backend.app.material.entity.MaterialError
import de.lambda9.ready2race.backend.app.material.entity.MaterialItemRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialItemStatus
import de.lambda9.ready2race.backend.app.material.entity.MaterialTypeRequest
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.file.File
import de.lambda9.ready2race.backend.pagination.PaginationParameters
import de.lambda9.ready2race.backend.validation.ValidationResult
import de.lambda9.ready2race.testing.kio.TestComprehensionScope
import de.lambda9.ready2race.testing.testComprehension
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Schadensakte, Fotos und CSV (Task 5.1). Fotos bleiben in-memory (`ByteArray`) - die
 * 11-MB-Prüfung ist damit schnell, ohne echte Dateien anzufassen.
 */
class MaterialDamageServiceTest {

    private data class Scenario(
        val providerId: UUID,
        val userId: UUID,
        val typeBoat: UUID,
        val itemId: UUID,
    )

    private fun TestComprehensionScope<JEnv>.setupScenario(): Scenario {
        val userId = !createTestUser()
        val providerId = (!MaterialService.addProvider(provider(), userId) as ApiResponse.Created).id
        val typeBoat =
            (!MaterialService.addType(MaterialTypeRequest("C4x+", MaterialCategory.BOAT, null), userId) as ApiResponse.Created).id
        val itemId = (
            !MaterialService.addItem(providerId, MaterialItemRequest(typeBoat, 3, "Boot 3", null, MaterialItemStatus.ACTIVE), userId)
                as ApiResponse.Created
            ).id

        return Scenario(providerId = providerId, userId = userId, typeBoat = typeBoat, itemId = itemId)
    }

    private fun damageRequest(
        s: Scenario,
        status: MaterialDamageStatus = MaterialDamageStatus.REPORTED,
        outOfServiceFrom: LocalDateTime? = null,
        outOfServiceUntil: LocalDateTime? = null,
        repairedAt: LocalDateTime? = null,
        causedByRegistration: UUID? = null,
        materialItem: UUID = s.itemId,
    ) = MaterialDamageRequest(
        materialItem = materialItem,
        reportedAt = seedTime,
        description = "Riss im Rumpf, Steuerbordseite",
        severity = MaterialDamageSeverity.MAJOR,
        status = status,
        causedByRegistration = causedByRegistration,
        outOfServiceFrom = outOfServiceFrom,
        outOfServiceUntil = outOfServiceUntil,
        repairedAt = repairedAt,
    )

    @Test
    fun addDamageWithOutageAppearsInOverviewOutages() = testComprehension {
        val s = setupScenario()

        val damageId = (
            !MaterialService.addDamage(
                s.providerId,
                damageRequest(s, outOfServiceFrom = seedTime, outOfServiceUntil = null),
                s.userId,
            ) as ApiResponse.Created
            ).id

        val items = !MaterialOverviewRepo.itemsForProvider(s.providerId)
        val outage = items.single { it.id == s.itemId }.outages.single()
        assertEquals(damageId, outage.damageId)
        assertEquals(seedTime, outage.from)
        assertNull(outage.until)
    }

    @Test
    fun repairClosesOpenWindow() = testComprehension {
        val s = setupScenario()

        val damageId = (
            !MaterialService.addDamage(
                s.providerId,
                damageRequest(s, outOfServiceFrom = seedTime, outOfServiceUntil = null),
                s.userId,
            ) as ApiResponse.Created
            ).id

        val repairedAt = seedTime.plusDays(3)
        !MaterialService.updateDamage(
            s.providerId,
            damageId,
            damageRequest(
                s,
                status = MaterialDamageStatus.REPAIRED,
                outOfServiceFrom = seedTime,
                outOfServiceUntil = null,
                repairedAt = repairedAt,
            ),
            s.userId,
        )

        val dto = (!MaterialService.getDamage(s.providerId, damageId)).dto
        assertEquals(MaterialDamageStatus.REPAIRED, dto.status)
        assertEquals(repairedAt, dto.outOfServiceUntil)

        // REPAIRED zählt nicht mehr als offener Schaden - die Übersicht liest nur status = REPORTED.
        val items = !MaterialOverviewRepo.itemsForProvider(s.providerId)
        assertTrue(items.single { it.id == s.itemId }.outages.isEmpty())
    }

    @Test
    fun repairWithLaterOpenUntilIsPulledToRepairedAt() = testComprehension {
        val s = setupScenario()
        val repairedAt = seedTime.plusDays(1)

        // out_of_service_until liegt nach repairedAt - Ruling Task 5.1: wird auf repairedAt gezogen.
        val damageId = (
            !MaterialService.addDamage(
                s.providerId,
                damageRequest(
                    s,
                    status = MaterialDamageStatus.REPAIRED,
                    outOfServiceFrom = seedTime,
                    outOfServiceUntil = seedTime.plusDays(10),
                    repairedAt = repairedAt,
                ),
                s.userId,
            ) as ApiResponse.Created
            ).id

        val dto = (!MaterialService.getDamage(s.providerId, damageId)).dto
        assertEquals(repairedAt, dto.outOfServiceUntil)
    }

    @Test
    fun photoTooLargeIsRejected() = testComprehension {
        val s = setupScenario()
        val damageId = (!MaterialService.addDamage(s.providerId, damageRequest(s), s.userId) as ApiResponse.Created).id

        val tooLarge = File("foto.jpg", ByteArray(11 * 1024 * 1024))

        assertKIOFails(MaterialError.PhotoTooLarge) {
            MaterialService.addPhotos(s.providerId, damageId, listOf(tooLarge))
        }
    }

    @Test
    fun invalidWindowIsRejected() = testComprehension {
        val s = setupScenario()

        assertKIOFails(MaterialError.InvalidOutageWindow) {
            MaterialService.addDamage(
                s.providerId,
                damageRequest(s, outOfServiceFrom = seedTime, outOfServiceUntil = seedTime.minusHours(1)),
                s.userId,
            )
        }
    }

    @Test
    fun statusRepairedRequiresRepairedAtOnRequestLevel() {
        // MaterialDamageRequest.validate() lehnt das schon vor dem Service ab (422) - kein Aufruf nötig.
        val request = MaterialDamageRequest(
            materialItem = UUID.randomUUID(),
            reportedAt = seedTime,
            description = "x",
            severity = MaterialDamageSeverity.MINOR,
            status = MaterialDamageStatus.REPAIRED,
            causedByRegistration = null,
            outOfServiceFrom = null,
            outOfServiceUntil = null,
            repairedAt = null,
        )
        assertTrue(request.validate() != ValidationResult.Valid)
    }

    @Test
    fun damageOnRetiredItemIsAllowed() = testComprehension {
        val s = setupScenario()
        !MaterialService.updateItem(
            s.providerId,
            s.itemId,
            MaterialItemRequest(s.typeBoat, 3, "Boot 3", null, MaterialItemStatus.RETIRED),
            s.userId,
        )

        assertKIOSucceeds {
            MaterialService.addDamage(s.providerId, damageRequest(s), s.userId)
        }
    }

    @Test
    fun causedByRegistrationFillsSnapshotColumns() = testComprehension {
        val s = setupScenario()
        val seeded = seedOpenTeamEvent()
        val teamId = UUID.randomUUID()
        val dto = upsertDto(
            seeded,
            listOf(teamDto(teamId, seeded.namedParticipantId, listOf(seeded.participant1, seeded.participant2))),
        )
        !EventRegistrationService.upsertRegistrationForEvent(seeded.eventId, dto, seeded.user)
        !MaterialService.inviteProvider(seeded.eventId, s.providerId, s.userId)

        val damageId = (
            !MaterialService.addDamage(s.providerId, damageRequest(s, causedByRegistration = teamId), s.userId)
                as ApiResponse.Created
            ).id

        val result = (!MaterialService.getDamage(s.providerId, damageId)).dto
        assertEquals(teamId, result.causedByRegistration)
        assertEquals("Ruderclub Test ${seeded.clubId}", result.causedByClub)
        // Wettkampfkennung + Name aus der Fixture (identifier "1", name "Vierer ohne").
        assertEquals("1 Vierer ohne", result.causedByCompetition)
    }

    @Test
    fun causedByRegistrationOfUninvitedProviderFails() = testComprehension {
        val s = setupScenario()
        val seeded = seedOpenTeamEvent()
        val teamId = UUID.randomUUID()
        val dto = upsertDto(
            seeded,
            listOf(teamDto(teamId, seeded.namedParticipantId, listOf(seeded.participant1, seeded.participant2))),
        )
        !EventRegistrationService.upsertRegistrationForEvent(seeded.eventId, dto, seeded.user)
        // s.providerId ist zu seeded.eventId nicht eingeladen.

        assertKIOFails(MaterialError.RegistrationNotFound) {
            MaterialService.addDamage(s.providerId, damageRequest(s, causedByRegistration = teamId), s.userId)
        }
    }

    @Test
    fun photoUploadDownloadAndDelete() = testComprehension {
        val s = setupScenario()
        val damageId = (!MaterialService.addDamage(s.providerId, damageRequest(s), s.userId) as ApiResponse.Created).id

        // Echte JPEG-Signatur: seit der Formatprüfung (MaterialPhotoType) weist der Dienst
        // beliebige Bytes ab.
        val jpeg = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte(), 0xE0.toByte(), 1, 2, 3)
        !MaterialService.addPhotos(s.providerId, damageId, listOf(File("riss.jpg", jpeg)))

        val result = (!MaterialService.getDamage(s.providerId, damageId)).dto
        val photo = result.photos.single()
        assertEquals("riss.jpg", photo.name)
        assertEquals("image/jpeg", photo.contentType)

        val downloaded = !MaterialService.getPhoto(s.providerId, photo.id) as ApiResponse.File
        assertEquals("riss.jpg", downloaded.name)
        assertTrue(jpeg.contentEquals(downloaded.bytes))

        !MaterialService.deletePhoto(s.providerId, photo.id)
        assertKIOFails(MaterialError.PhotoNotFound) {
            MaterialService.getPhoto(s.providerId, photo.id)
        }
    }

    @Test
    fun pageDamagesFiltersByItem() = testComprehension {
        val s = setupScenario()
        val otherItem = (
            !MaterialService.addItem(s.providerId, MaterialItemRequest(s.typeBoat, 4, "Boot 4", null, MaterialItemStatus.ACTIVE), s.userId)
                as ApiResponse.Created
            ).id

        !MaterialService.addDamage(s.providerId, damageRequest(s), s.userId)
        !MaterialService.addDamage(s.providerId, damageRequest(s, materialItem = otherItem), s.userId)

        val page = !MaterialService.pageDamages(
            s.providerId,
            PaginationParameters(limit = null, offset = null, sort = null, search = null),
            eventId = null,
            itemId = otherItem,
        )
        val single = page.data.single()
        assertEquals(otherItem, single.materialItem)
    }

    @Test
    fun pageDamagesDefaultsToReportedAtDescending() = testComprehension {
        val s = setupScenario()

        val first = (
            !MaterialService.addDamage(s.providerId, damageRequest(s), s.userId) as ApiResponse.Created
            ).id
        val second = (
            !MaterialService.addDamage(
                s.providerId,
                MaterialDamageRequest(
                    materialItem = s.itemId,
                    reportedAt = seedTime.plusDays(1),
                    description = "Zweiter Schaden",
                    severity = MaterialDamageSeverity.MINOR,
                    status = MaterialDamageStatus.REPORTED,
                    causedByRegistration = null,
                    outOfServiceFrom = null,
                    outOfServiceUntil = null,
                    repairedAt = null,
                ),
                s.userId,
            ) as ApiResponse.Created
            ).id

        val page = !MaterialService.pageDamages(
            s.providerId,
            PaginationParameters(limit = null, offset = null, sort = null, search = null),
        )
        assertEquals(listOf(second, first), page.data.map { it.id })
    }

    @Test
    fun damagesCsvContainsRowForProviderEvent() = testComprehension {
        val s = setupScenario()
        val seeded = seedOpenTeamEvent()
        val teamId = UUID.randomUUID()
        val dto = upsertDto(
            seeded,
            listOf(teamDto(teamId, seeded.namedParticipantId, listOf(seeded.participant1, seeded.participant2))),
        )
        !EventRegistrationService.upsertRegistrationForEvent(seeded.eventId, dto, seeded.user)
        !MaterialService.inviteProvider(seeded.eventId, s.providerId, s.userId)

        !MaterialService.addDamage(s.providerId, damageRequest(s, causedByRegistration = teamId), s.userId)

        val file = !MaterialService.damagesCsv(seeded.eventId, s.providerId) as ApiResponse.File
        val text = file.bytes.toString(Charsets.UTF_8)
        assertTrue(text.contains("Boot 3"))
        assertTrue(text.contains("1 Vierer ohne"))
    }

    @Test
    fun damagesCsvRejectsUninvitedProvider() = testComprehension {
        val s = setupScenario()
        val seeded = seedOpenTeamEvent()

        assertKIOFails(MaterialError.NotInvited) {
            MaterialService.damagesCsv(seeded.eventId, s.providerId)
        }
    }
}
