package de.lambda9.ready2race.backend.app.participantTracking

import de.lambda9.ready2race.backend.app.JEnv
import de.lambda9.ready2race.backend.app.participantTracking.boundary.ParticipantTrackingService
import de.lambda9.ready2race.backend.app.participantTracking.entity.ParticipantTrackingError
import de.lambda9.ready2race.backend.database.SYSTEM_USER
import de.lambda9.ready2race.backend.database.generated.enums.Gender
import de.lambda9.ready2race.backend.database.generated.tables.records.ClubRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.EventRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.ParticipantRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.CLUB
import de.lambda9.ready2race.backend.database.generated.tables.references.EVENT
import de.lambda9.ready2race.backend.database.generated.tables.references.PARTICIPANT
import de.lambda9.ready2race.backend.database.insert
import de.lambda9.ready2race.testing.kio.TestComprehensionScope
import de.lambda9.ready2race.testing.ConcurrentTx
import de.lambda9.ready2race.testing.testCommittingComprehension
import de.lambda9.ready2race.backend.app.participantTracking.control.ParticipantTrackingRepo
import de.lambda9.tailwind.core.extensions.exit.fold
import de.lambda9.tailwind.core.extensions.kio.orDie
import kotlin.test.assertEquals
import kotlin.test.fail
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test

/**
 * Zwei gleichzeitige Scans derselben Person (Doppel-Tap in der PWA, zwei Helfer am Steg) in zwei
 * echten Transaktionen: der zweite muss den ersten sehen und "schon eingecheckt" melden, statt
 * ein zweites ENTRY in die Kette zu schreiben.
 */
class CheckInConcurrencyTest {

    private val now: LocalDateTime = LocalDateTime.of(2026, 8, 14, 9, 0)

    /** Verein, Person, Veranstaltung - mehr berührt der Check-in nicht. */
    private fun TestComprehensionScope<JEnv>.seed(): Pair<UUID, UUID> {
        val clubId = UUID.randomUUID()
        val participantId = UUID.randomUUID()
        val eventId = UUID.randomUUID()

        !CLUB.insert(
            ClubRecord(
                id = clubId,
                // club.name ist unique und die Datenbank steht zwischen den Tests dieser Klasse
                name = "Testverein $clubId",
                createdAt = now,
                updatedAt = now,
            )
        )

        !PARTICIPANT.insert(
            ParticipantRecord(
                id = participantId,
                club = clubId,
                firstname = "Test",
                lastname = "Ruderin",
                year = 1990,
                gender = Gender.F,
                createdAt = now,
                updatedAt = now,
            )
        )

        !EVENT.insert(
            EventRecord(
                id = eventId,
                name = "Testregatta",
                createdAt = now,
                updatedAt = now,
            )
        )

        return participantId to eventId
    }

    @Test
    fun parallelCheckInsOfOnePersonWriteOneEntry() = testCommittingComprehension {
        val (participantId, eventId) = seed()

        val (_, second) = ConcurrentTx.runHoldingFirst(
            env,
            first = ParticipantTrackingService.participantCheckInOut(participantId, eventId, SYSTEM_USER, checkIn = true),
            second = ParticipantTrackingService.participantCheckInOut(participantId, eventId, SYSTEM_USER, checkIn = true),
        )

        second.fold(
            onSuccess = { fail("Der zweite gleichzeitige Check-in hätte abgewiesen werden müssen") },
            onError = { assertEquals(ParticipantTrackingError.TeamAlreadyCheckedIn, it) },
            onDefect = { fail("Der zweite Check-in starb: $it") },
        )
        assertEquals(1, (!ParticipantTrackingRepo.get(participantId, eventId).orDie()).size)
    }
}
