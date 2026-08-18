package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.event.control.EventRepo
import de.lambda9.ready2race.backend.app.appuser.control.AppUserRepo
import de.lambda9.ready2race.backend.app.club.control.ClubRepo
import de.lambda9.ready2race.backend.app.competition.control.CompetitionRepo
import de.lambda9.ready2race.backend.app.competitionExecution.control.CompetitionMatchRepo
import de.lambda9.ready2race.backend.app.competitionExecution.control.CompetitionMatchTeamRepo
import de.lambda9.ready2race.backend.app.competitionProperties.control.CompetitionPropertiesRepo
import de.lambda9.ready2race.backend.app.competitionRegistration.control.CompetitionRegistrationRepo
import de.lambda9.ready2race.backend.app.competitionSetup.control.CompetitionSetupMatchRepo
import de.lambda9.ready2race.backend.app.competitionSetup.control.CompetitionSetupRepo
import de.lambda9.ready2race.backend.app.competitionSetup.control.CompetitionSetupRoundRepo
import de.lambda9.ready2race.backend.app.competitionSetup.entity.CompetitionSetupPlacesOption
import de.lambda9.ready2race.backend.app.eventRegistration.control.EventRegistrationRepo
import de.lambda9.ready2race.backend.app.timing.boundary.TimingService
import de.lambda9.ready2race.backend.app.timing.entity.AssignTimeMarkRequest
import de.lambda9.ready2race.backend.app.timing.entity.CreateTimeMarkRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationType
import de.lambda9.ready2race.backend.app.timingConfig.entity.TimingSystem
import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.database.generated.tables.records.ClubRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionMatchRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionMatchTeamRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionPropertiesRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionRegistrationRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionSetupMatchRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionSetupRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionSetupRoundRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.EventRegistrationRecord
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.orDie
import java.time.LocalDateTime
import java.util.UUID

// Insert a minimal event + app user directly via repos and return their ids.
//
// The event defaults to READY2RACE: every timing endpoint is scoped to the competitions this
// application actually times (effective timing system = competition's own value, else the event's),
// so without the default no fixture team would be in scope at all. A competition can still opt out
// per-competition - see [createTestMatchTeams].
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
            timingSystem = TimingSystem.READY2RACE.name,
            createdAt = now,
            createdBy = userId,
            updatedAt = now,
            updatedBy = userId,
        )
    ).orDie()

    KIO.ok(eventId to userId)
}

fun addTestStation(
    eventId: UUID,
    userId: UUID,
    type: TimingStationType = TimingStationType.FINISH,
    // Name and sorting matter for SPLIT stations: they become the name and the position of the lap
    // rows written from their marks.
    sorting: Int = 0,
    name: String = "Station-${UUID.randomUUID()}",
): App<Any?, UUID> = KIO.comprehension {
    val response = !TimingService.addStation(
        TimingStationRequest(name = name, type = type, sorting = sorting),
        userId,
        eventId,
    )
    KIO.ok((response as ApiResponse.Created).id)
}

// Builds the minimal FK chain needed to reach a competition_match_team row for
// a given event, inserting directly via JOOQ table helpers instead of going
// through the full competition-creation service stack (setup templates,
// challenge configs, registration validation, etc. are all irrelevant here).
// Chain: club -> event_registration -> competition -> competition_properties
//        -> competition_setup -> competition_setup_round -> competition_setup_match
//        -> competition_match -> competition_registration -> competition_match_team
fun createTestMatchTeam(eventId: UUID, timingSystem: TimingSystem? = null): App<Any?, UUID> =
    createTestMatchTeams(eventId, 1, timingSystem).map { it.first() }

/**
 * [timingSystem] sets the COMPETITION's own timing system; null means it inherits the event's
 * (READY2RACE, see [createTestEventWithAdmin]). Passing [TimingSystem.RACECLOCKER] is how the tests
 * build a mixed event - one competition this application times, one it must keep its hands off.
 */
fun createTestMatchTeams(
    eventId: UUID,
    teamCount: Int,
    timingSystem: TimingSystem? = null,
): App<Any?, List<UUID>> = KIO.comprehension {
    val now = LocalDateTime.now()

    val clubId = UUID.randomUUID()
    !ClubRepo.create(
        ClubRecord(
            id = clubId,
            name = "Timing Test Club-${UUID.randomUUID()}",
            createdAt = now,
            updatedAt = now,
        )
    ).orDie()

    val eventRegistrationId = UUID.randomUUID()
    !EventRegistrationRepo.create(
        EventRegistrationRecord(
            id = eventRegistrationId,
            event = eventId,
            club = clubId,
            createdAt = now,
            updatedAt = now,
        )
    ).orDie()

    val competitionId = UUID.randomUUID()
    !CompetitionRepo.create(
        CompetitionRecord(
            id = competitionId,
            event = eventId,
            timingSystem = timingSystem?.name,
            createdAt = now,
            updatedAt = now,
        )
    ).orDie()

    val competitionPropertiesId = UUID.randomUUID()
    !CompetitionPropertiesRepo.create(
        CompetitionPropertiesRecord(
            id = competitionPropertiesId,
            competition = competitionId,
            identifier = "TST-${UUID.randomUUID()}",
            name = "Timing Test Competition",
        )
    ).orDie()

    !CompetitionSetupRepo.create(
        CompetitionSetupRecord(
            competitionProperties = competitionPropertiesId,
            createdAt = now,
            updatedAt = now,
        )
    ).orDie()

    val roundId = UUID.randomUUID()
    !CompetitionSetupRoundRepo.create(
        listOf(
            CompetitionSetupRoundRecord(
                id = roundId,
                competitionSetup = competitionPropertiesId,
                name = "Round 1",
                required = true,
                useDefaultSeeding = true,
                placesOption = CompetitionSetupPlacesOption.ASCENDING.name,
            )
        )
    ).orDie()

    val setupMatchId = UUID.randomUUID()
    !CompetitionSetupMatchRepo.create(
        listOf(
            CompetitionSetupMatchRecord(
                id = setupMatchId,
                competitionSetupRound = roundId,
                weighting = 1,
                executionOrder = 1,
            )
        )
    ).orDie()

    !CompetitionMatchRepo.create(
        listOf(
            CompetitionMatchRecord(
                competitionSetupMatch = setupMatchId,
                createdAt = now,
                updatedAt = now,
            )
        )
    ).orDie()

    val competitionRegistrationId = UUID.randomUUID()
    !CompetitionRegistrationRepo.create(
        CompetitionRegistrationRecord(
            id = competitionRegistrationId,
            eventRegistration = eventRegistrationId,
            competition = competitionId,
            club = clubId,
            createdAt = now,
            updatedAt = now,
        )
    ).orDie()

    val matchTeamIds = List(teamCount) { UUID.randomUUID() }
    !CompetitionMatchTeamRepo.create(
        matchTeamIds.mapIndexed { index, id ->
            CompetitionMatchTeamRecord(
                id = id,
                competitionMatch = setupMatchId,
                competitionRegistration = competitionRegistrationId,
                startNumber = index + 1,
                createdAt = now,
                updatedAt = now,
            )
        }
    ).orDie()

    KIO.ok(matchTeamIds)
}

/**
 * An ACTIVE time mark on [stationId] that is assigned to [teamId] - the shape the official-time
 * layer consumes (only assigned, non-retracted marks count as start/finish).
 */
fun addAssignedMark(
    eventId: UUID,
    userId: UUID,
    stationId: UUID,
    teamId: UUID,
    timestampMillis: Long,
): App<Any?, UUID> = KIO.comprehension {
    val markId = UUID.randomUUID()
    !TimingService.createTimeMark(CreateTimeMarkRequest(markId, stationId, timestampMillis), userId, eventId)
    !TimingService.assignTimeMark(AssignTimeMarkRequest(teamId), userId, markId, eventId)
    KIO.ok(markId)
}
