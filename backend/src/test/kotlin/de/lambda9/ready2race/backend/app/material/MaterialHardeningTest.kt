package de.lambda9.ready2race.backend.app.material

import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.competitionProperties.control.CompetitionPropertiesHasMaterialTypeRepo
import de.lambda9.ready2race.backend.app.eventRegistration.boundary.EventRegistrationService
import de.lambda9.ready2race.backend.app.material.boundary.MaterialPhotoType
import de.lambda9.ready2race.backend.app.material.boundary.MaterialService
import de.lambda9.ready2race.backend.app.material.control.MaterialRequestRepo
import de.lambda9.ready2race.backend.app.material.entity.MaterialCategory
import de.lambda9.ready2race.backend.app.material.entity.MaterialDamageRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialDamageSeverity
import de.lambda9.ready2race.backend.app.material.entity.MaterialDamageStatus
import de.lambda9.ready2race.backend.app.material.entity.MaterialDecisionRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialError
import de.lambda9.ready2race.backend.app.material.entity.MaterialItemRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialItemStatus
import de.lambda9.ready2race.backend.app.material.entity.MaterialOfferRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialProviderRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialRequestStatus
import de.lambda9.ready2race.backend.app.material.entity.MaterialTypeRequest
import de.lambda9.ready2race.backend.app.role.boundary.RoleService
import de.lambda9.ready2race.backend.app.role.entity.RoleError
import de.lambda9.ready2race.backend.app.role.entity.RoleRequest
import de.lambda9.ready2race.backend.app.timing.createTestEventWithAdmin
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserWithPrivilegesRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionPropertiesHasMaterialTypeRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.APP_USER
import de.lambda9.ready2race.backend.database.generated.tables.references.EMAIL
import de.lambda9.ready2race.backend.database.generated.tables.references.MATERIAL_DAMAGE_PHOTO
import de.lambda9.ready2race.backend.database.insert
import de.lambda9.ready2race.backend.database.update
import de.lambda9.ready2race.backend.file.File
import de.lambda9.ready2race.testing.testComprehension
import de.lambda9.tailwind.jooq.Jooq
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Härtung der Materialvermietung nach den Mustern des aktuellen Stands: Löschen eines Anbieters
 * mit zugeordneten Konten, Einladung eines unbekannten Anbieters, der nicht kopierbare Job
 * Materialanbieter, Bildformat der Schadensfotos und die Sprache der Rückzugs-Mail.
 */
class MaterialHardeningTest {

    private val jpeg = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte(), 0xE0.toByte(), 0, 0x10)
    private val svg = "<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>".toByteArray()

    @Test
    fun providerWithAssignedUsersCannotBeDeleted() = testComprehension {
        val userId = !createTestUser()
        val providerId = (!MaterialService.addProvider(provider(), userId) as ApiResponse.Created).id
        !APP_USER.update({ materialProvider = providerId }) { ID.eq(userId) }

        // Ohne diese Sperre bliebe nach `on delete set null` die Materialanbieter-Rolle am Konto.
        assertKIOFails(MaterialError.ProviderHasUsers) { MaterialService.deleteProvider(providerId) }

        !APP_USER.update({ materialProvider = null }) { ID.eq(userId) }
        !MaterialService.deleteProvider(providerId)
    }

    @Test
    fun invitingAnUnknownProviderIsANotFoundNotADefect() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        assertKIOFails(MaterialError.ProviderNotFound) {
            MaterialService.inviteProvider(eventId, UUID.randomUUID(), userId)
        }
    }

    @Test
    fun theMaterialProviderJobIsNoCopyTemplate() = testComprehension {
        val jobs = (!RoleService.jobs()).data
        assertFalse(jobs.any { it.key == "MATERIAL_PROVIDER" }, "der Rollendialog bietet den Job nicht an")
        assertTrue(jobs.any { it.key == "CLUB_REPRESENTATIVE" })

        val requester = AppUserWithPrivilegesRecord(id = UUID.randomUUID())
        assertKIOFails(RoleError.JobNotCopyable) {
            RoleService.addRole(RoleRequest("Anbieter-Kopie", null, emptyList(), job = "MATERIAL_PROVIDER"), requester)
        }
    }

    @Test
    fun photoFormatIsDetectedFromTheBytes() {
        assertEquals("image/jpeg", MaterialPhotoType.detect(jpeg))
        assertEquals(
            "image/png",
            MaterialPhotoType.detect(byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0)),
        )
        assertEquals("image/webp", MaterialPhotoType.detect("RIFF\u0000\u0000\u0000\u0000WEBPVP8 ".toByteArray()))
        assertEquals("image/heic", MaterialPhotoType.detect("\u0000\u0000\u0000\u0018ftypheic".toByteArray()))
        assertNull(MaterialPhotoType.detect(svg))
        assertNull(MaterialPhotoType.detect(ByteArray(0)))
        assertEquals("schaden.jpg", MaterialPhotoType.normalizedName("schaden.svg", "image/jpeg"))
        assertEquals("foto.png", MaterialPhotoType.normalizedName(".png", "image/png"))
        assertEquals("bild.jpg", MaterialPhotoType.normalizedName("../../bild", "image/jpeg"))
    }

    @Test
    fun damagePhotosMustBeImagesAndGetAMatchingName() = testComprehension {
        val userId = !createTestUser()
        val providerId = (!MaterialService.addProvider(provider(), userId) as ApiResponse.Created).id
        val typeId =
            (!MaterialService.addType(MaterialTypeRequest("C1x", MaterialCategory.BOAT, null), userId) as ApiResponse.Created).id
        val itemId = (
            !MaterialService.addItem(providerId, MaterialItemRequest(typeId, 1, "Boot 1", null, MaterialItemStatus.ACTIVE), userId)
                as ApiResponse.Created
            ).id
        val damageId = (
            !MaterialService.addDamage(
                providerId,
                MaterialDamageRequest(itemId, seedTime, "Kratzer", MaterialDamageSeverity.MINOR, MaterialDamageStatus.REPORTED, null, null, null, null),
                userId,
            ) as ApiResponse.Created
            ).id

        // Ein Nicht-Bild in der Liste weist die ganze Liste ab, bevor etwas geschrieben wird.
        assertKIOFails(MaterialError.PhotoInvalidType) {
            MaterialService.addPhotos(providerId, damageId, listOf(File("ok.jpg", jpeg), File("boese.svg", svg)))
        }
        assertEquals(0, !Jooq.query { fetchCount(MATERIAL_DAMAGE_PHOTO, MATERIAL_DAMAGE_PHOTO.MATERIAL_DAMAGE.eq(damageId)) })

        // JPEG-Bytes unter SVG-Namen: gespeichert als .jpg, damit die Auslieferung (Inhaltstyp aus
        // dem Namen) kein SVG daraus macht.
        !MaterialService.addPhotos(providerId, damageId, listOf(File("tarnung.svg", jpeg)))
        val stored = !Jooq.query { selectFrom(MATERIAL_DAMAGE_PHOTO).where(MATERIAL_DAMAGE_PHOTO.MATERIAL_DAMAGE.eq(damageId)).fetchSingle() }
        assertEquals("tarnung.jpg", stored.name)
        assertEquals("image/jpeg", stored.contentType)

        // Ein fremder Anbieter sieht weder Akte noch Foto.
        val otherProvider = (!MaterialService.addProvider(provider("Fremd"), userId) as ApiResponse.Created).id
        assertKIOFails(MaterialError.PhotoNotFound) { MaterialService.getPhoto(otherProvider, stored.id) }
        assertKIOFails(MaterialError.DamageNotFound) {
            MaterialService.addPhotos(otherProvider, damageId, listOf(File("x.jpg", jpeg)))
        }
    }

    @Test
    fun withdrawalMailFollowsTheLanguageOfTheContactAccount() = testComprehension {
        val seeded = seedOpenTeamEvent()
        val teamId = UUID.randomUUID()
        !EventRegistrationService.upsertRegistrationForEvent(
            seeded.eventId,
            upsertDto(seeded, listOf(teamDto(teamId, seeded.namedParticipantId, listOf(seeded.participant1, seeded.participant2)))),
            seeded.user,
        )

        val contact = "kontakt-${UUID.randomUUID()}@bootshaus.example"
        !APP_USER.insert(
            AppUserRecord(
                id = UUID.randomUUID(),
                email = contact,
                password = "x",
                firstname = "Kontakt",
                lastname = "Anbieter",
                language = "EN",
                createdAt = seedTime,
                updatedAt = seedTime,
            )
        )

        val userId = !createTestUser()
        val providerId = (
            !MaterialService.addProvider(MaterialProviderRequest("Bootshaus Englisch", null, contact, null, null), userId)
                as ApiResponse.Created
            ).id
        val typeBoat =
            (!MaterialService.addType(MaterialTypeRequest("C4x+", MaterialCategory.BOAT, null), userId) as ApiResponse.Created).id
        !CompetitionPropertiesHasMaterialTypeRepo.create(
            listOf(CompetitionPropertiesHasMaterialTypeRecord(competitionProperties = seeded.propertiesId, materialType = typeBoat, count = 1))
        )
        !MaterialService.inviteProvider(seeded.eventId, providerId, userId)
        val offer = (
            !MaterialService.addOffer(seeded.eventId, providerId, MaterialOfferRequest(typeBoat, null, 3, 30), userId)
                as ApiResponse.Created
            ).id

        !MaterialService.setRequestsForRegistration(seeded.eventId, teamId, Privilege.Scope.GLOBAL to null, listOf(offer), userId)
        val requestId = (!MaterialRequestRepo.forRegistration(teamId)).single().id
        !MaterialService.decideRequest(
            seeded.eventId, providerId, requestId, MaterialDecisionRequest(MaterialRequestStatus.CONFIRMED, null), userId,
        )
        !MaterialService.setRequestsForRegistration(seeded.eventId, teamId, Privilege.Scope.GLOBAL to null, emptyList(), userId)

        val mail = !Jooq.query { selectFrom(EMAIL).where(EMAIL.RECIPIENT.eq(contact)).fetchSingle() }
        assertEquals("Ready2Race - Material request withdrawn", mail.subject)
    }
}
