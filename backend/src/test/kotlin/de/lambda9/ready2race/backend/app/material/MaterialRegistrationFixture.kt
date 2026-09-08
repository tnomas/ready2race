package de.lambda9.ready2race.backend.app.material

import de.lambda9.ready2race.backend.app.JEnv
import de.lambda9.ready2race.backend.app.competitionSetup.entity.CompetitionSetupPlacesOption
import de.lambda9.ready2race.backend.app.eventRegistration.entity.CompetitionRegistrationNamedParticipantUpsertDto
import de.lambda9.ready2race.backend.app.eventRegistration.entity.CompetitionRegistrationTeamUpsertDto
import de.lambda9.ready2race.backend.app.eventRegistration.entity.CompetitionRegistrationUpsertDto
import de.lambda9.ready2race.backend.app.eventRegistration.entity.EventRegistrationParticipantUpsertDto
import de.lambda9.ready2race.backend.app.eventRegistration.entity.EventRegistrationUpsertDto
import de.lambda9.ready2race.backend.database.generated.enums.Gender
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserWithPrivilegesRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.ClubRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionMatchRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionMatchTeamRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionPropertiesHasNamedParticipantRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionPropertiesRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionSetupMatchRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionSetupRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionSetupRoundRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.EventRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.NamedParticipantRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.ParticipantRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.APP_USER
import de.lambda9.ready2race.backend.database.generated.tables.references.CLUB
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_MATCH
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_MATCH_TEAM
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_PROPERTIES
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_PROPERTIES_HAS_NAMED_PARTICIPANT
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_SETUP
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_SETUP_MATCH
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_SETUP_ROUND
import de.lambda9.ready2race.backend.database.generated.tables.references.EVENT
import de.lambda9.ready2race.backend.database.generated.tables.references.NAMED_PARTICIPANT
import de.lambda9.ready2race.backend.database.generated.tables.references.PARTICIPANT
import de.lambda9.ready2race.backend.database.insert
import de.lambda9.ready2race.testing.kio.TestComprehensionScope
import java.time.LocalDateTime
import java.util.UUID

/**
 * Geteilte Fixture für Tests, die eine echte Meldung über
 * [de.lambda9.ready2race.backend.app.eventRegistration.boundary.EventRegistrationService.upsertRegistrationForEvent]
 * brauchen - aus `EventRegistrationStableIdsTest` (Task 3.0) herausgezogen, weil
 * `MaterialRequestServiceTest` (Task 3.1) dieselbe Ausgangslage braucht, nur zusätzlich mit
 * Anbieter, Einladung, Angebot und Bedarf.
 */
val seedTime: LocalDateTime = LocalDateTime.of(2026, 9, 1, 10, 0)

data class SeededTeamEvent(
    val eventId: UUID,
    val clubId: UUID,
    val user: AppUserWithPrivilegesRecord,
    val competitionId: UUID,
    val propertiesId: UUID,
    val namedParticipantId: UUID,
    val participant1: UUID,
    val participant2: UUID,
)

/**
 * Verein, Nutzer mit Verein, eine offen für Anmeldung stehende Veranstaltung und ein
 * Team-Wettkampf mit einem Teilnehmer-Slot für zwei Personen ("Ruderer", 2 gemischte Plätze) -
 * genug, um über [de.lambda9.ready2race.backend.app.eventRegistration.boundary.EventRegistrationService.upsertRegistrationForEvent]
 * eine echte Meldung anzulegen.
 */
fun TestComprehensionScope<JEnv>.seedOpenTeamEvent(): SeededTeamEvent {
    val eventId = UUID.randomUUID()
    val clubId = UUID.randomUUID()
    val userId = UUID.randomUUID()
    val competitionId = UUID.randomUUID()
    val propertiesId = UUID.randomUUID()
    val namedParticipantId = UUID.randomUUID()
    val participant1 = UUID.randomUUID()
    val participant2 = UUID.randomUUID()

    !CLUB.insert(
        ClubRecord(id = clubId, name = "Ruderclub Test $clubId", createdAt = seedTime, updatedAt = seedTime)
    )

    !APP_USER.insert(
        AppUserRecord(
            id = userId,
            email = "melder-$userId@example.org",
            password = "x",
            firstname = "Melde",
            lastname = "Nutzer",
            language = "de",
            createdAt = seedTime,
            updatedAt = seedTime,
            club = clubId,
        )
    )

    !EVENT.insert(
        EventRecord(
            id = eventId,
            name = "Testregatta",
            published = true,
            registrationAvailableFrom = seedTime.minusDays(1),
            createdAt = seedTime,
            createdBy = userId,
            updatedAt = seedTime,
            updatedBy = userId,
        )
    )

    !COMPETITION.insert(
        CompetitionRecord(
            id = competitionId,
            event = eventId,
            createdAt = seedTime,
            createdBy = userId,
            updatedAt = seedTime,
            updatedBy = userId,
        )
    )
    !COMPETITION_PROPERTIES.insert(
        CompetitionPropertiesRecord(
            id = propertiesId,
            competition = competitionId,
            identifier = "1",
            name = "Vierer ohne",
        )
    )
    !NAMED_PARTICIPANT.insert(
        NamedParticipantRecord(id = namedParticipantId, name = "Ruderer", createdAt = seedTime, updatedAt = seedTime)
    )
    // 2 gemischte Plätze - reicht für zwei Personen gleichen Geschlechts, ohne dass die
    // Geschlechterverteilung der Meldung geprüft werden muss.
    !COMPETITION_PROPERTIES_HAS_NAMED_PARTICIPANT.insert(
        CompetitionPropertiesHasNamedParticipantRecord(
            competitionProperties = propertiesId,
            namedParticipant = namedParticipantId,
            countMales = 0,
            countFemales = 0,
            countNonBinary = 0,
            countMixed = 2,
        )
    )

    listOf(participant1, participant2).forEach { id ->
        !PARTICIPANT.insert(
            ParticipantRecord(
                id = id,
                club = clubId,
                firstname = "Ruder",
                lastname = "Person $id",
                year = 1995,
                gender = Gender.M,
                external = false,
                createdAt = seedTime,
                updatedAt = seedTime,
            )
        )
    }

    return SeededTeamEvent(
        eventId = eventId,
        clubId = clubId,
        // language und email werden für die Bestätigungsmail gebraucht
        // (EventRegistrationService liest user.language!! und user.email!!) - ohne das
        // knallt der Erfolgspfad mit einer NPE.
        user = AppUserWithPrivilegesRecord(
            id = userId,
            club = clubId,
            language = "DE",
            firstname = "Melde",
            lastname = "Nutzer",
            email = "melder-$userId@example.org",
        ),
        competitionId = competitionId,
        propertiesId = propertiesId,
        namedParticipantId = namedParticipantId,
        participant1 = participant1,
        participant2 = participant2,
    )
}

fun participantDto(id: UUID) = EventRegistrationParticipantUpsertDto(
    id = id,
    isNew = false,
    hasChanged = false,
    firstname = "Ruder",
    lastname = "Person $id",
    year = 1995,
    gender = Gender.M,
    email = null,
    external = null,
    externalClubName = null,
    competitionsSingle = null,
)

fun teamDto(
    teamId: UUID,
    namedParticipantId: UUID,
    participantIds: List<UUID>,
) = CompetitionRegistrationTeamUpsertDto(
    id = teamId,
    clubId = null,
    optionalFees = null,
    namedParticipants = listOf(CompetitionRegistrationNamedParticipantUpsertDto(namedParticipantId, participantIds)),
    ratingCategory = null,
    callbackUrl = null,
)

fun upsertDto(
    seeded: SeededTeamEvent,
    teams: List<CompetitionRegistrationTeamUpsertDto>,
) = EventRegistrationUpsertDto(
    participants = listOf(participantDto(seeded.participant1), participantDto(seeded.participant2)),
    competitionRegistrations = listOf(
        CompetitionRegistrationUpsertDto(competitionId = seeded.competitionId, teams = teams)
    ),
    message = null,
    callbackUrl = null,
)

data class SeededMatch(val roundId: UUID, val matchId: UUID)

/**
 * Ein Lauf für den Wettkampf aus [seedOpenTeamEvent] - Runde, ein Lauf mit Startzeit, die Meldung
 * als Team mit Startnummer. Nach dem Vorbild von `ClubChainFixture.seedClubChain`, hier ohne die
 * Vereinskette - nur das Minimum, das [de.lambda9.ready2race.backend.app.material.control.MaterialOverviewRepo]
 * für die Läufe einer Meldung braucht (Task 4.1).
 */
fun TestComprehensionScope<JEnv>.seedMatch(
    propertiesId: UUID,
    registrationId: UUID,
    startTime: LocalDateTime? = seedTime,
    startNumber: Int = 1,
): SeededMatch {
    val roundId = UUID.randomUUID()
    val matchId = UUID.randomUUID()

    !COMPETITION_SETUP.insert(
        CompetitionSetupRecord(
            competitionProperties = propertiesId,
            createdAt = seedTime,
            updatedAt = seedTime,
        )
    )
    !COMPETITION_SETUP_ROUND.insert(
        CompetitionSetupRoundRecord(
            id = roundId,
            competitionSetup = propertiesId,
            name = "Vorlauf",
            required = true,
            useDefaultSeeding = true,
            placesOption = CompetitionSetupPlacesOption.EQUAL.name,
        )
    )
    !COMPETITION_SETUP_MATCH.insert(
        CompetitionSetupMatchRecord(
            id = matchId,
            competitionSetupRound = roundId,
            weighting = 1,
            name = "Lauf 1",
            executionOrder = 1,
            teams = 1,
        )
    )
    !COMPETITION_MATCH.insert(
        CompetitionMatchRecord(
            competitionSetupMatch = matchId,
            startTime = startTime,
            createdAt = seedTime,
            updatedAt = seedTime,
        )
    )
    !COMPETITION_MATCH_TEAM.insert(
        CompetitionMatchTeamRecord(
            id = UUID.randomUUID(),
            competitionMatch = matchId,
            competitionRegistration = registrationId,
            startNumber = startNumber,
            createdAt = seedTime,
            updatedAt = seedTime,
        )
    )

    return SeededMatch(roundId = roundId, matchId = matchId)
}
