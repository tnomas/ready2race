package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.event.control.EventRepo
import de.lambda9.ready2race.backend.app.appuser.control.AppUserRepo
import de.lambda9.ready2race.backend.app.timing.boundary.TimingService
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationType
import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.orDie
import java.time.LocalDateTime
import java.util.UUID

// Insert a minimal event + app user directly via repos and return their ids.
fun createTestEventWithAdmin(): App<Any?, Pair<UUID, UUID>> = KIO.comprehension {
    val now = LocalDateTime.now()
    val userId = UUID.randomUUID()
    !AppUserRepo.create(
        de.lambda9.ready2race.backend.database.generated.tables.records.AppUserRecord(
            id = userId,
            email = "timing-test-${UUID.randomUUID()}@example.com",
            password = "irrelevant",
            firstname = "Timing",
            lastname = "Tester",
            language = "de",
            createdAt = now,
            updatedAt = now,
        )
    ).orDie()

    val eventId = UUID.randomUUID()
    !EventRepo.create(
        de.lambda9.ready2race.backend.database.generated.tables.records.EventRecord(
            id = eventId,
            name = "Timing Test Event",
            createdAt = now,
            createdBy = userId,
            updatedAt = now,
            updatedBy = userId,
        )
    ).orDie()

    KIO.ok(eventId to userId)
}

fun addTestStation(eventId: UUID, userId: UUID): App<Any?, UUID> = KIO.comprehension {
    val response = !TimingService.addStation(
        TimingStationRequest(name = "Station-${UUID.randomUUID()}", type = TimingStationType.FINISH, sorting = 0),
        userId,
        eventId,
    )
    KIO.ok((response as ApiResponse.Created).id)
}
