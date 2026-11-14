package de.lambda9.ready2race.backend.app.material

import de.lambda9.ready2race.backend.app.JEnv
import de.lambda9.ready2race.backend.app.appuser.control.AppUserHasRoleRepo
import de.lambda9.ready2race.backend.app.appuser.control.AppUserRepo
import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.competitionProperties.control.CompetitionPropertiesHasMaterialTypeRepo
import de.lambda9.ready2race.backend.app.competitionRegistration.control.CompetitionRegistrationRepo
import de.lambda9.ready2race.backend.app.email.entity.EmailLanguage
import de.lambda9.ready2race.backend.app.material.boundary.MaterialService
import de.lambda9.ready2race.backend.app.material.control.MaterialRequestRepo
import de.lambda9.ready2race.backend.app.material.entity.MaterialCategory
import de.lambda9.ready2race.backend.app.material.entity.MaterialDamageRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialDamageSeverity
import de.lambda9.ready2race.backend.app.material.entity.MaterialDamageStatus
import de.lambda9.ready2race.backend.app.material.entity.MaterialDecisionRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialItemRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialItemStatus
import de.lambda9.ready2race.backend.app.material.entity.MaterialOfferRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialRequestStatus
import de.lambda9.ready2race.backend.app.material.entity.MaterialTypeRequest
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.database.MATERIAL_PROVIDER_ROLE
import de.lambda9.ready2race.backend.database.SYSTEM_USER
import de.lambda9.ready2race.backend.database.USER_ROLE
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserHasRoleRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionPropertiesHasMaterialTypeRecord
import de.lambda9.ready2race.backend.file.File
import de.lambda9.ready2race.backend.security.PasswordUtilities
import de.lambda9.ready2race.testing.TEST_PASSWORD
import de.lambda9.ready2race.testing.TestApplicationComprehensionScope
import de.lambda9.ready2race.testing.loginWith
import de.lambda9.ready2race.testing.testApplicationComprehension
import io.ktor.client.request.*
import io.ktor.client.request.forms.*
import io.ktor.client.statement.*
import io.ktor.http.*
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Die Materialvermietung über HTTP - die zwei Aussagen, die kein Service-Test treffen kann:
 *
 * 1. Das Meldeformular mit seinem **echten Payload** gegen die echten Routen: Anmelden, Anfrage
 *    stellen, erneut speichern (Meldungs-ID und Anfrage bleiben), Meldung entfernen (die Anfrage
 *    verschwindet - der aufgeschobene Trigger feuert am Commit der Anfrage).
 * 2. Kein Datenleck zwischen Anbietern: jede Route mit `providerId` prüft OWN, auch Fotos, CSV und
 *    der Foto-Upload (dort bevor der Körper gelesen wird).
 *
 * Läuft als `IT` nicht in der normalen Suite (Surefire nimmt nur `*Test`). Gezielt:
 *
 * ```
 * ./mvnw test -Dtest=MaterialHttpIT -DfailIfNoSpecifiedTests=false
 * ```
 */
class MaterialHttpIT {

    private val now: LocalDateTime = LocalDateTime.of(2026, 9, 1, 10, 0)

    private val jpeg = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte(), 0xE0.toByte(), 0, 0x10)

    /** Ein Anbieter-Konto wie über die Anbieter-Zuordnung angelegt: USER + Materialanbieter-Rolle. */
    private suspend fun TestApplicationComprehensionScope<JEnv>.loginProvider(providerId: UUID): String {
        val userId = UUID.randomUUID()
        val email = "anbieter-$userId@example.org"
        !AppUserRepo.create(
            AppUserRecord(
                id = userId,
                email = email,
                firstname = "Anbieter",
                lastname = "Test",
                password = !PasswordUtilities.hash(TEST_PASSWORD),
                language = EmailLanguage.DE.name,
                materialProvider = providerId,
                createdAt = now,
                createdBy = SYSTEM_USER,
                updatedAt = now,
                updatedBy = SYSTEM_USER,
            )
        )
        !AppUserHasRoleRepo.create(AppUserHasRoleRecord(appUser = userId, role = USER_ROLE))
        !AppUserHasRoleRepo.create(AppUserHasRoleRecord(appUser = userId, role = MATERIAL_PROVIDER_ROLE))

        val response = client.post("/api/login") {
            contentType(ContentType.Application.Json)
            setBody("""{"email":"$email","password":"$TEST_PASSWORD"}""")
        }
        assertEquals(HttpStatusCode.OK, response.status, "Anmeldung als Anbieter")
        return assertNotNull(response.headers["X-Api-Session"])
    }

    private fun registerPayload(seeded: SeededTeamEvent, teamIds: List<UUID>): String {
        fun participant(id: UUID) = """{"id":"$id","isNew":false,"hasChanged":false,"firstname":"Ruder","lastname":"Person $id","year":1995,"gender":"M","email":null,"external":false,"externalClubName":null,"competitionsSingle":[]}"""
        val teams = teamIds.map { id ->
            """{"id":"$id","optionalFees":[],"namedParticipants":[{"namedParticipantId":"${seeded.namedParticipantId}","participantIds":["${seeded.participant1}","${seeded.participant2}"]}]}"""
        }
        return """{"participants":[${participant(seeded.participant1)},${participant(seeded.participant2)}],""" +
            """"competitionRegistrations":[{"competitionId":"${seeded.competitionId}","teams":[${teams.joinToString(",")}]}],""" +
            """"callbackUrl":"http://localhost:5123/challenge/"}"""
    }

    @Test
    fun registrationFormWithMaterialRequestThroughTheRealRoutes() = testApplicationComprehension {
        val seeded = seedOpenTeamEvent()
        val userId = !createTestUser()
        val providerId = (!MaterialService.addProvider(provider(), userId) as ApiResponse.Created).id
        val typeBoat =
            (!MaterialService.addType(MaterialTypeRequest("C2x", MaterialCategory.BOAT, null), userId) as ApiResponse.Created).id
        !CompetitionPropertiesHasMaterialTypeRepo.create(
            listOf(CompetitionPropertiesHasMaterialTypeRecord(competitionProperties = seeded.propertiesId, materialType = typeBoat, count = 1))
        )
        !MaterialService.inviteProvider(seeded.eventId, providerId, userId)
        val offerId = (
            !MaterialService.addOffer(seeded.eventId, providerId, MaterialOfferRequest(typeBoat, "55 €", 3, 30), userId)
                as ApiResponse.Created
            ).id

        val session = loginWith(
            listOf(Privilege.CreateRegistrationOwn, Privilege.UpdateRegistrationOwn, Privilege.ReadRegistrationOwn),
            club = seeded.clubId,
        )
        val teamId = UUID.randomUUID()

        suspend fun register(teams: List<UUID>) {
            val response = client.post("/api/event/${seeded.eventId}/register") {
                header("X-Api-Session", session)
                contentType(ContentType.Application.Json)
                setBody(registerPayload(seeded, teams))
            }
            assertEquals(HttpStatusCode.Created, response.status, response.bodyAsText())
        }

        // Anlegen ohne Anfrage, dann die Anfrage wie syncMaterialRequests.
        register(listOf(teamId))
        val put = client.put("/api/event/${seeded.eventId}/competitionRegistration/$teamId/materialRequests") {
            header("X-Api-Session", session)
            contentType(ContentType.Application.Json)
            setBody("""{"offerIds":["$offerId"]}""")
        }
        assertEquals(HttpStatusCode.NoContent, put.status, put.bodyAsText())
        val requestId = (!MaterialRequestRepo.forRegistration(teamId)).single().id
        !MaterialService.decideRequest(
            seeded.eventId, providerId, requestId, MaterialDecisionRequest(MaterialRequestStatus.CONFIRMED, null), userId,
        )

        // Erneut speichern: ID und bestätigte Anfrage überleben den Commit.
        register(listOf(teamId))
        assertEquals(listOf(teamId), (!CompetitionRegistrationRepo.getByClub(seeded.clubId)).map { it.id })
        val kept = (!MaterialRequestRepo.forRegistration(teamId)).single()
        assertEquals(requestId, kept.id)
        assertEquals(MaterialRequestStatus.CONFIRMED.name, kept.status)

        // Meldung entfernen: am Commit räumt der Trigger die Anfrage weg.
        register(emptyList())
        assertTrue((!MaterialRequestRepo.forRegistration(teamId)).isEmpty())
    }

    @Test
    fun aProviderNeverReachesAnotherProvidersData() = testApplicationComprehension {
        val seeded = seedOpenTeamEvent()
        val userId = !createTestUser()
        val own = (!MaterialService.addProvider(provider("Eigener Anbieter"), userId) as ApiResponse.Created).id
        val foreign = (!MaterialService.addProvider(provider("Fremder Anbieter"), userId) as ApiResponse.Created).id
        val typeBoat =
            (!MaterialService.addType(MaterialTypeRequest("C4x+", MaterialCategory.BOAT, null), userId) as ApiResponse.Created).id
        listOf(own, foreign).forEach { !MaterialService.inviteProvider(seeded.eventId, it, userId) }
        val foreignItem = (
            !MaterialService.addItem(foreign, MaterialItemRequest(typeBoat, 8, "Boot 8", null, MaterialItemStatus.ACTIVE), userId)
                as ApiResponse.Created
            ).id
        val foreignDamage = (
            !MaterialService.addDamage(
                foreign,
                MaterialDamageRequest(foreignItem, now, "Leck", MaterialDamageSeverity.TOTAL, MaterialDamageStatus.REPORTED, null, now, null, null),
                userId,
            ) as ApiResponse.Created
            ).id
        !MaterialService.addPhotos(foreign, foreignDamage, listOf(File("leck.jpg", jpeg)))
        val foreignPhoto = (!MaterialService.getDamage(foreign, foreignDamage)).dto.photos.single().id

        val session = loginProvider(own)

        suspend fun status(method: HttpMethod, path: String): HttpStatusCode =
            client.request(path) {
                this.method = method
                header("X-Api-Session", session)
            }.status

        val e = seeded.eventId
        assertEquals(HttpStatusCode.OK, status(HttpMethod.Get, "/api/event/$e/materialProvider/$own/overview"))
        assertEquals(HttpStatusCode.Forbidden, status(HttpMethod.Get, "/api/event/$e/materialProvider/$foreign/overview"))
        assertEquals(HttpStatusCode.Forbidden, status(HttpMethod.Get, "/api/materialProvider/$foreign"))
        assertEquals(HttpStatusCode.Forbidden, status(HttpMethod.Get, "/api/materialProvider/$foreign/item"))
        assertEquals(HttpStatusCode.Forbidden, status(HttpMethod.Get, "/api/materialProvider/$foreign/damage"))
        assertEquals(HttpStatusCode.Forbidden, status(HttpMethod.Get, "/api/materialProvider/$foreign/damage/$foreignDamage"))
        assertEquals(HttpStatusCode.Forbidden, status(HttpMethod.Get, "/api/materialProvider/$foreign/photo/$foreignPhoto"))
        assertEquals(HttpStatusCode.Forbidden, status(HttpMethod.Get, "/api/event/$e/materialProvider/$foreign/damage/csv"))
        assertEquals(HttpStatusCode.Forbidden, status(HttpMethod.Get, "/api/event/$e/materialProvider/$foreign/offer"))
        // Über den eigenen Pfad an fremde Akte und fremdes Foto: wie nicht vorhanden.
        assertEquals(HttpStatusCode.NotFound, status(HttpMethod.Get, "/api/materialProvider/$own/damage/$foreignDamage"))
        assertEquals(HttpStatusCode.NotFound, status(HttpMethod.Get, "/api/materialProvider/$own/photo/$foreignPhoto"))
        assertEquals(HttpStatusCode.NotFound, status(HttpMethod.Delete, "/api/materialProvider/$own/photo/$foreignPhoto"))
        assertEquals(HttpStatusCode.Forbidden, status(HttpMethod.Delete, "/api/materialProvider/$foreign/photo/$foreignPhoto"))
        // Das fremde Foto hat beide Löschversuche überstanden.
        assertEquals(foreignPhoto, (!MaterialService.getDamage(foreign, foreignDamage)).dto.photos.single().id)
        // Verwaltung bleibt GLOBAL.
        assertEquals(HttpStatusCode.Forbidden, status(HttpMethod.Get, "/api/materialProvider"))

        // Foto-Upload in eine fremde Akte: abgewiesen; ohne Anmeldung gar nicht erst gelesen.
        val upload = MultiPartFormDataContent(
            formData {
                append("files", jpeg, Headers.build {
                    append(HttpHeaders.ContentType, "image/jpeg")
                    append(HttpHeaders.ContentDisposition, "filename=\"x.jpg\"")
                })
            }
        )
        val foreignUpload = client.post("/api/materialProvider/$foreign/damage/$foreignDamage/photo") {
            header("X-Api-Session", session)
            setBody(upload)
        }
        assertEquals(HttpStatusCode.Forbidden, foreignUpload.status)
        val anonymous = client.post("/api/materialProvider/$foreign/damage/$foreignDamage/photo") { setBody(upload) }
        assertEquals(HttpStatusCode.Unauthorized, anonymous.status)
    }

    /**
     * „Zu prüfen" (d): Die Grenzen greifen schon beim Lesen - eine Datei über 10 MB und mehrere
     * Dateien über der Gesamtgrenze enden als 400 `MATERIAL_PHOTO_TOO_LARGE`, und nichts wird
     * gespeichert.
     */
    @Test
    fun photoUploadLimitsApplyWhileReading() = testApplicationComprehension {
        val userId = !createTestUser()
        val providerId = (!MaterialService.addProvider(provider("Grenzen"), userId) as ApiResponse.Created).id
        val typeBoat =
            (!MaterialService.addType(MaterialTypeRequest("C1x", MaterialCategory.BOAT, null), userId) as ApiResponse.Created).id
        val item = (
            !MaterialService.addItem(providerId, MaterialItemRequest(typeBoat, 1, "Boot 1", null, MaterialItemStatus.ACTIVE), userId)
                as ApiResponse.Created
            ).id
        val damage = (
            !MaterialService.addDamage(
                providerId,
                MaterialDamageRequest(item, now, "Delle", MaterialDamageSeverity.MINOR, MaterialDamageStatus.REPORTED, null, null, null, null),
                userId,
            ) as ApiResponse.Created
            ).id
        val session = loginProvider(providerId)

        fun jpegOf(size: Int) = ByteArray(size).also { jpeg.copyInto(it) }

        suspend fun upload(files: List<ByteArray>): HttpResponse =
            client.post("/api/materialProvider/$providerId/damage/$damage/photo") {
                header("X-Api-Session", session)
                setBody(
                    MultiPartFormDataContent(
                        formData {
                            files.forEachIndexed { i, bytes ->
                                append("files", bytes, Headers.build {
                                    append(HttpHeaders.ContentType, "image/jpeg")
                                    append(HttpHeaders.ContentDisposition, "filename=\"f$i.jpg\"")
                                })
                            }
                        }
                    )
                )
            }

        val tooLarge = upload(listOf(jpegOf(10 * 1024 * 1024 + 1)))
        assertEquals(HttpStatusCode.BadRequest, tooLarge.status)
        assertTrue(tooLarge.bodyAsText().contains("MATERIAL_PHOTO_TOO_LARGE"), tooLarge.bodyAsText())

        val tooMuch = upload(List(6) { jpegOf(9 * 1024 * 1024) })
        assertEquals(HttpStatusCode.BadRequest, tooMuch.status)
        assertTrue(tooMuch.bodyAsText().contains("MATERIAL_PHOTO_TOO_LARGE"), tooMuch.bodyAsText())

        assertTrue((!MaterialService.getDamage(providerId, damage)).dto.photos.isEmpty())

        // Unter den Grenzen geht es weiter durch.
        assertEquals(HttpStatusCode.NoContent, upload(listOf(jpegOf(1024), jpegOf(2048))).status)
        assertEquals(2, (!MaterialService.getDamage(providerId, damage)).dto.photos.size)
    }
}
