package de.lambda9.ready2race.backend.app.competitionRegistration

import de.lambda9.ready2race.backend.app.JEnv
import de.lambda9.ready2race.backend.app.email.entity.EmailLanguage
import de.lambda9.ready2race.backend.database.generated.enums.Gender
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserWithPrivilegesRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.ClubRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionPropertiesHasNamedParticipantRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionPropertiesRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionRegistrationNamedParticipantRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionRegistrationRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.EventRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.EventRegistrationRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.NamedParticipantRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.ParticipantRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.APP_USER
import de.lambda9.ready2race.backend.database.generated.tables.references.CLUB
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_PROPERTIES
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_PROPERTIES_HAS_NAMED_PARTICIPANT
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_REGISTRATION
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_REGISTRATION_NAMED_PARTICIPANT
import de.lambda9.ready2race.backend.database.generated.tables.references.EVENT
import de.lambda9.ready2race.backend.database.generated.tables.references.EVENT_REGISTRATION
import de.lambda9.ready2race.backend.database.generated.tables.references.NAMED_PARTICIPANT
import de.lambda9.ready2race.backend.database.generated.tables.references.PARTICIPANT
import de.lambda9.ready2race.backend.database.insert
import de.lambda9.ready2race.testing.kio.TestComprehensionScope
import java.time.LocalDateTime
import java.util.UUID

/*
 * Eine Veranstaltung im regulären Meldezeitraum mit zwei Vereinen A und B. Jeder Verein hat eine
 * Meldung zur Veranstaltung, eine Person und einen Vertreter-Account; B hat zusätzlich eine
 * Wettkampfmeldung mit seiner Person im Einer. Damit lassen sich Zugriffe über Vereinsgrenzen
 * hinweg prüfen, ohne dass ein Test die halbe Datenbank selbst aufbauen muss.
 */

data class SeededClub(
    val clubId: UUID,
    val eventRegistrationId: UUID,
    val participantId: UUID,
    val user: AppUserWithPrivilegesRecord,
)

data class SeededRegistrations(
    val eventId: UUID,
    val competitionId: UUID,
    val namedParticipantId: UUID,
    val a: SeededClub,
    val b: SeededClub,
    /** Die Wettkampfmeldung von Verein B (mit Bs Person im Boot). */
    val registrationOfB: UUID,
)

fun TestComprehensionScope<JEnv>.seedEvent(
    now: LocalDateTime = LocalDateTime.now(),
    lateRegistrationTo: LocalDateTime? = null,
    regularTo: LocalDateTime = now.plusDays(10),
    published: Boolean = true,
    participantSelfRegistration: Boolean = false,
): UUID {
    val eventId = UUID.randomUUID()
    !EVENT.insert(
        EventRecord(
            id = eventId,
            name = "Testregatta $eventId",
            published = published,
            registrationAvailableFrom = now.minusDays(10),
            registrationAvailableTo = regularTo,
            lateRegistrationAvailableTo = lateRegistrationTo,
            participantSelfRegistration = participantSelfRegistration,
            createdAt = now,
            updatedAt = now,
        )
    )
    return eventId
}

/** Ein Einer-Wettkampf (eine Rolle, ein Platz beliebigen Geschlechts). */
fun TestComprehensionScope<JEnv>.seedSingleCompetition(
    eventId: UUID,
    namedParticipantId: UUID,
    lateRegistrationAllowed: Boolean = false,
    identifier: String = "1",
): UUID {
    val now = LocalDateTime.now()
    val competitionId = UUID.randomUUID()
    val propertiesId = UUID.randomUUID()
    !COMPETITION.insert(CompetitionRecord(id = competitionId, event = eventId, createdAt = now, updatedAt = now))
    !COMPETITION_PROPERTIES.insert(
        CompetitionPropertiesRecord(
            id = propertiesId,
            competition = competitionId,
            identifier = identifier,
            name = "Einer $identifier",
            lateRegistrationAllowed = lateRegistrationAllowed,
            ratingCategoryRequired = false,
        )
    )
    !COMPETITION_PROPERTIES_HAS_NAMED_PARTICIPANT.insert(
        CompetitionPropertiesHasNamedParticipantRecord(
            competitionProperties = propertiesId,
            namedParticipant = namedParticipantId,
            countMales = 0,
            countFemales = 0,
            countNonBinary = 0,
            countMixed = 1,
        )
    )
    return competitionId
}

fun TestComprehensionScope<JEnv>.seedNamedParticipant(name: String = "Ruderer"): UUID {
    val now = LocalDateTime.now()
    val id = UUID.randomUUID()
    !NAMED_PARTICIPANT.insert(NamedParticipantRecord(id = id, name = "$name $id", createdAt = now, updatedAt = now))
    return id
}

fun TestComprehensionScope<JEnv>.seedClubWithUser(eventId: UUID, name: String): SeededClub {
    val now = LocalDateTime.now()
    val clubId = UUID.randomUUID()
    !CLUB.insert(ClubRecord(id = clubId, name = "$name $clubId", createdAt = now, updatedAt = now))

    val userId = UUID.randomUUID()
    !APP_USER.insert(
        AppUserRecord(
            id = userId,
            email = "vertretung-$userId@example.org",
            password = "x",
            firstname = "Vertretung",
            lastname = name,
            language = EmailLanguage.DE.name,
            club = clubId,
            createdAt = now,
            updatedAt = now,
        )
    )

    val eventRegistrationId = UUID.randomUUID()
    !EVENT_REGISTRATION.insert(
        EventRegistrationRecord(
            id = eventRegistrationId,
            event = eventId,
            club = clubId,
            createdAt = now,
            updatedAt = now,
        )
    )

    val participantId = seedParticipant(clubId, "Person $name")

    return SeededClub(
        clubId = clubId,
        eventRegistrationId = eventRegistrationId,
        participantId = participantId,
        user = AppUserWithPrivilegesRecord(
            id = userId,
            email = "vertretung-$userId@example.org",
            firstname = "Vertretung",
            lastname = name,
            language = EmailLanguage.DE.name,
            club = clubId,
            privileges = emptyArray(),
        ),
    )
}

fun TestComprehensionScope<JEnv>.seedParticipant(clubId: UUID, lastname: String): UUID {
    val now = LocalDateTime.now()
    val id = UUID.randomUUID()
    !PARTICIPANT.insert(
        ParticipantRecord(
            id = id,
            club = clubId,
            firstname = "Test",
            lastname = lastname,
            year = 1990,
            gender = Gender.M,
            createdAt = now,
            updatedAt = now,
        )
    )
    return id
}

fun TestComprehensionScope<JEnv>.seedCompetitionRegistration(
    competitionId: UUID,
    club: SeededClub,
    namedParticipantId: UUID,
    participantId: UUID = club.participantId,
): UUID {
    val now = LocalDateTime.now()
    val id = UUID.randomUUID()
    !COMPETITION_REGISTRATION.insert(
        CompetitionRegistrationRecord(
            id = id,
            eventRegistration = club.eventRegistrationId,
            competition = competitionId,
            club = club.clubId,
            createdAt = now,
            createdBy = club.user.id,
            updatedAt = now,
            updatedBy = club.user.id,
            isLate = false,
        )
    )
    !COMPETITION_REGISTRATION_NAMED_PARTICIPANT.insert(
        CompetitionRegistrationNamedParticipantRecord(
            competitionRegistration = id,
            namedParticipant = namedParticipantId,
            participant = participantId,
        )
    )
    return id
}

fun TestComprehensionScope<JEnv>.seedRegistrations(): SeededRegistrations {
    val eventId = seedEvent()
    val namedParticipantId = seedNamedParticipant()
    val competitionId = seedSingleCompetition(eventId, namedParticipantId)
    val a = seedClubWithUser(eventId, "A")
    val b = seedClubWithUser(eventId, "B")
    val registrationOfB = seedCompetitionRegistration(competitionId, b, namedParticipantId)
    return SeededRegistrations(
        eventId = eventId,
        competitionId = competitionId,
        namedParticipantId = namedParticipantId,
        a = a,
        b = b,
        registrationOfB = registrationOfB,
    )
}
