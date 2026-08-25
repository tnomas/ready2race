package de.lambda9.ready2race.backend.app.paceReference

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.appuser.control.AppUserRepo
import de.lambda9.ready2race.backend.app.paceReference.boundary.PaceReferenceService
import de.lambda9.ready2race.backend.app.paceReference.entity.PaceReferenceDto
import de.lambda9.ready2race.backend.app.paceReference.entity.PaceReferenceError
import de.lambda9.ready2race.backend.app.paceReference.entity.PaceReferenceMode
import de.lambda9.ready2race.backend.app.paceReference.entity.PaceReferenceRequest
import de.lambda9.ready2race.backend.app.paceReference.entity.PaceReferenceSort
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

/**
 * Der Katalog der Bezugsgrößen gegen echtes Postgres.
 *
 * Der Schwerpunkt liegt auf der Namensprüfung: Sie sitzt im Dienst VOR dem Unique-Index, damit ein
 * doppelter Name als Domänenfehler herauskommt und nicht als roher Datenbank-Defekt - und genau
 * das kann man nur an einer echten Datenbank belegen. Gleiches Muster wie `TimingModeServiceTest` bei den Zeitnahmetypen.
 */
class PaceReferenceServiceTest {

    /**
     * Die Bezugsgröße hängt an keiner Veranstaltung; gebraucht wird nur ein Benutzer, denn
     * `created_by` zeigt auf `app_user`.
     */
    private fun createTestUser(): App<Any?, UUID> = KIO.comprehension {
        val now = LocalDateTime.now()
        val userId = UUID.randomUUID()
        !AppUserRepo.create(
            AppUserRecord(
                id = userId,
                email = "pace-test-${UUID.randomUUID()}@example.com",
                password = "irrelevant",
                firstname = "Pace",
                lastname = "Tester",
                language = "de",
                createdAt = now,
                updatedAt = now,
            )
        ).orDie()
        KIO.ok(userId)
    }

    private fun request(
        name: String = "Rudern",
        mode: PaceReferenceMode = PaceReferenceMode.TIME_PER_DISTANCE,
        referenceMeters: Int = 500,
    ) = PaceReferenceRequest(name = name, mode = mode, referenceMeters = referenceMeters)

    private fun page(): App<Any?, List<PaceReferenceDto>> =
        PaceReferenceService.page(PaginationParameters<PaceReferenceSort>(null, null, null, null))
            .map { it.data }

    @Test
    fun addAndReadBack() = testComprehension {
        val userId = !createTestUser()

        val created = !PaceReferenceService.addPaceReference(request(), userId)
        val id = (created as ApiResponse.Created).id
        // Zweite Bezugsgröße der anderen Art: Die Umwandlung Aufzählung <-> Textspalte muss für
        // beide Ausprägungen tragen, nicht nur für die zuerst geschriebene.
        !PaceReferenceService.addPaceReference(
            request(name = "Radsport", mode = PaceReferenceMode.DISTANCE_PER_TIME, referenceMeters = 1000),
            userId,
        )

        val entries = !page()
        assertEquals(2, entries.size)

        val rowing = entries.single { it.id == id }
        assertEquals("Rudern", rowing.name)
        assertEquals(PaceReferenceMode.TIME_PER_DISTANCE, rowing.mode)
        assertEquals(500, rowing.referenceMeters)

        val cycling = entries.single { it.name == "Radsport" }
        assertEquals(PaceReferenceMode.DISTANCE_PER_TIME, cycling.mode)
        assertEquals(1000, cycling.referenceMeters)
    }

    @Test
    fun duplicateNameIsRejected() = testComprehension {
        val userId = !createTestUser()
        !PaceReferenceService.addPaceReference(request(), userId)

        // Als Domänenfehler, nicht als Defekt: assertKIOFails scheitert auch dann, wenn der
        // Unique-Index als roher Datenbankfehler durchschlüge.
        assertKIOFails(PaceReferenceError.NameTaken) {
            PaceReferenceService.addPaceReference(request(referenceMeters = 1000), userId)
        }

        assertEquals(1, (!page()).size)
    }

    @Test
    fun renamingToItsOwnNameIsAllowed() = testComprehension {
        val userId = !createTestUser()
        val id = ((!PaceReferenceService.addPaceReference(request(), userId)) as ApiResponse.Created).id

        // Der Fall, an dem ein falsch gesetztes excludingId auffliegt: Der eigene Eintrag darf
        // seinen Namen behalten, während nur die Bezugsstrecke wandert.
        assertKIOSucceeds<ApiResponse.NoData> {
            PaceReferenceService.updatePaceReference(id, request(referenceMeters = 1000), userId)
        }

        val entry = (!page()).single()
        assertEquals("Rudern", entry.name)
        assertEquals(1000, entry.referenceMeters)
    }

    @Test
    fun renamingToAnotherEntrysNameIsRejected() = testComprehension {
        val userId = !createTestUser()
        !PaceReferenceService.addPaceReference(request(), userId)
        val id = ((!PaceReferenceService.addPaceReference(request(name = "Laufen", referenceMeters = 1000), userId))
            as ApiResponse.Created).id

        // Gegenprobe zum Fall darüber: excludingId nimmt den eigenen Eintrag aus der Prüfung, nicht
        // die fremden.
        assertKIOFails(PaceReferenceError.NameTaken) {
            PaceReferenceService.updatePaceReference(id, request(), userId)
        }
    }

    @Test
    fun deleteIsPossibleRightAfterCreation() = testComprehension {
        val userId = !createTestUser()
        val id = ((!PaceReferenceService.addPaceReference(request(), userId)) as ApiResponse.Created).id

        // Keine Sperre wie bei Rennen und Zeitnahmetypen: Die Bezugsgröße ist reine Anzeige.
        assertKIOSucceeds<ApiResponse.NoData> { PaceReferenceService.deletePaceReference(id) }
        assertEquals(0, (!page()).size)
    }

    @Test
    fun deletingAnUnknownIdFails() = testComprehension {
        !createTestUser()

        assertKIOFails(PaceReferenceError.NotFound) {
            PaceReferenceService.deletePaceReference(UUID.randomUUID())
        }
    }
}
