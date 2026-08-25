package de.lambda9.ready2race.backend.app.raceclocker

import de.lambda9.ready2race.backend.app.raceclocker.boundary.RaceClockerRaceService
import de.lambda9.ready2race.backend.app.raceclocker.entity.RaceClockerRaceError
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.EventRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.RaceclockerRaceRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingProfileAssignmentRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION
import de.lambda9.ready2race.backend.database.generated.tables.references.EVENT
import de.lambda9.ready2race.backend.database.generated.tables.references.RACECLOCKER_RACE
import de.lambda9.ready2race.backend.database.generated.tables.references.TIMING_PROFILE_ASSIGNMENT
import de.lambda9.ready2race.backend.database.delete
import de.lambda9.ready2race.backend.database.insert
import de.lambda9.ready2race.testing.testComprehension
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.recover
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

/**
 * Die Löschsperre für RaceClocker-Rennen gegen ein echtes Postgres.
 *
 * Warum diese Ebene: Die Sperre zählt seit dem Zeitnahmeprofil-Baum die Zuordnungen aller vier
 * Ebenen (`timing_profile_assignment`), und deren Fremdschlüssel steht auf ON DELETE RESTRICT.
 * Ohne die Prüfung im Service käme statt einer verständlichen Meldung ein roher
 * Constraint-Fehler aus der Datenbank. Genau dieses Zusammenspiel aus Constraint und
 * Service-Prüfung sieht nur die Datenbank.
 */
class RaceClockerRaceDeleteTest {

    private val now: LocalDateTime = LocalDateTime.of(2026, 8, 13, 12, 0)

    @Test
    fun `blockt solange eine Ebene zugewiesen ist und löscht nach dem Abhaken`() =
        testComprehension {
            val eventId = UUID.randomUUID()
            val raceId = UUID.randomUUID()
            val competitionId = UUID.randomUUID()
            val assignmentId = UUID.randomUUID()

            !EVENT.insert(EventRecord(id = eventId, name = "Testregatta", createdAt = now, updatedAt = now))
            !RACECLOCKER_RACE.insert(
                RaceclockerRaceRecord(
                    id = raceId,
                    event = eventId,
                    name = "Timetrails",
                    resultsUrl = "https://raceclocker.com/track/testrace",
                    capturesLaps = false,
                    position = 1,
                    createdAt = now,
                    updatedAt = now,
                )
            )
            !COMPETITION.insert(
                CompetitionRecord(
                    id = competitionId,
                    event = eventId,
                    createdAt = now,
                    updatedAt = now,
                )
            )
            // Die Zuordnung steht im Profil-Baum - hier auf der Wettkampf-Ebene; für die Sperre
            // zählt jede der vier Ebenen gleich.
            !TIMING_PROFILE_ASSIGNMENT.insert(
                TimingProfileAssignmentRecord(
                    id = assignmentId,
                    event = eventId,
                    competition = competitionId,
                    raceclockerRace = raceId,
                    createdAt = now,
                    updatedAt = now,
                )
            )

            // Noch zugewiesen: der Service muss blocken, nicht in den Constraint laufen.
            val blocked = !RaceClockerRaceService.deleteRace(eventId, raceId)
                .map { null as RaceClockerRaceError? }
                .recover { error -> KIO.ok(error as? RaceClockerRaceError) }
            assertEquals(RaceClockerRaceError.StillAssigned, blocked)

            // Zuordnung abhaken - danach geht das Löschen durch.
            !TIMING_PROFILE_ASSIGNMENT.delete { ID.eq(assignmentId) }
            val deleted = !RaceClockerRaceService.deleteRace(eventId, raceId)
                .map { true }
                .recover { KIO.ok(false) }
            assertNotNull(deleted)
            assertEquals(true, deleted)

            // Und das Rennen ist wirklich weg.
            val remaining = !de.lambda9.tailwind.jooq.Jooq.query {
                selectFrom(RACECLOCKER_RACE).where(RACECLOCKER_RACE.ID.eq(raceId)).fetchOne()
            }
            assertNull(remaining)
        }
}
