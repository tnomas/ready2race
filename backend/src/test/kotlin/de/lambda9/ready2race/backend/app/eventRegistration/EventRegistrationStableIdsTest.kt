package de.lambda9.ready2race.backend.app.eventRegistration

import de.lambda9.ready2race.backend.app.JEnv
import de.lambda9.ready2race.backend.app.competitionRegistration.control.CompetitionRegistrationRepo
import de.lambda9.ready2race.backend.app.eventRegistration.boundary.EventRegistrationService
import de.lambda9.ready2race.backend.app.eventRegistration.entity.CompetitionRegistrationNamedParticipantUpsertDto
import de.lambda9.ready2race.backend.app.eventRegistration.entity.CompetitionRegistrationTeamUpsertDto
import de.lambda9.ready2race.backend.app.eventRegistration.entity.CompetitionRegistrationUpsertDto
import de.lambda9.ready2race.backend.app.eventRegistration.entity.EventRegistrationParticipantUpsertDto
import de.lambda9.ready2race.backend.app.eventRegistration.entity.EventRegistrationUpsertDto
import de.lambda9.ready2race.backend.app.material.boundary.MaterialService
import de.lambda9.ready2race.backend.app.material.control.MaterialRequestRepo
import de.lambda9.ready2race.backend.app.material.createTestUser
import de.lambda9.ready2race.backend.app.material.entity.MaterialCategory
import de.lambda9.ready2race.backend.app.material.entity.MaterialOfferRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialRequestStatus
import de.lambda9.ready2race.backend.app.material.entity.MaterialTypeRequest
import de.lambda9.ready2race.backend.app.material.provider
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.database.generated.enums.Gender
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserWithPrivilegesRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.ClubRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionPropertiesHasNamedParticipantRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionPropertiesRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.EventRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.MaterialRequestRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.NamedParticipantRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.ParticipantRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.APP_USER
import de.lambda9.ready2race.backend.database.generated.tables.references.CLUB
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_PROPERTIES
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_PROPERTIES_HAS_NAMED_PARTICIPANT
import de.lambda9.ready2race.backend.database.generated.tables.references.EVENT
import de.lambda9.ready2race.backend.database.generated.tables.references.NAMED_PARTICIPANT
import de.lambda9.ready2race.backend.database.generated.tables.references.PARTICIPANT
import de.lambda9.ready2race.backend.database.insert
import de.lambda9.ready2race.testing.kio.TestComprehensionScope
import de.lambda9.ready2race.testing.testComprehension
import de.lambda9.tailwind.jooq.Jooq
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Meldungs-IDs müssen ein erneutes Speichern der Anmeldung überleben, weil Materialanfragen der
 * Materialvermietung an der Meldung hängen (Task 3.0). Die Anmeldung löscht beim Speichern alle
 * nicht gesperrten Meldungen und legt sie neu an - dieser Test belegt, dass eine vom Formular
 * zurückgegebene ID dabei erhalten bleibt, und dass eine wirklich entfernte Meldung ihre
 * Materialanfrage mitnimmt, ohne die aufgeschobene Fremdschlüsselprüfung zu verletzen.
 */
class EventRegistrationStableIdsTest {

    private val seedTime: LocalDateTime = LocalDateTime.of(2026, 9, 1, 10, 0)

    private data class SeededTeamEvent(
        val eventId: UUID,
        val clubId: UUID,
        val user: AppUserWithPrivilegesRecord,
        val competitionId: UUID,
        val namedParticipantId: UUID,
        val participant1: UUID,
        val participant2: UUID,
    )

    /**
     * Verein, Nutzer mit Verein, eine offen für Anmeldung stehende Veranstaltung und ein
     * Team-Wettkampf mit einem Teilnehmer-Slot für zwei Personen ("Ruderer", 2 gemischte Plätze) -
     * genug, um über [EventRegistrationService.upsertRegistrationForEvent] eine echte Meldung
     * anzulegen.
     */
    private fun TestComprehensionScope<JEnv>.seedOpenTeamEvent(): SeededTeamEvent {
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
            namedParticipantId = namedParticipantId,
            participant1 = participant1,
            participant2 = participant2,
        )
    }

    private fun participantDto(id: UUID) = EventRegistrationParticipantUpsertDto(
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

    private fun teamDto(
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

    private fun upsertDto(
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

    @Test
    fun teamIdSurvivesResave() = testComprehension {
        val seeded = seedOpenTeamEvent()
        val teamId = UUID.randomUUID()
        val dto = upsertDto(
            seeded,
            listOf(teamDto(teamId, seeded.namedParticipantId, listOf(seeded.participant1, seeded.participant2))),
        )

        !EventRegistrationService.upsertRegistrationForEvent(seeded.eventId, dto, seeded.user)
        // Erneutes Speichern derselben Meldung - die Anmeldung löscht die Meldung und legt sie
        // neu an. Ohne die Client-ID würde die Materialanfrage jetzt ins Leere zeigen.
        !EventRegistrationService.upsertRegistrationForEvent(seeded.eventId, dto, seeded.user)

        val regs = !CompetitionRegistrationRepo.getByClub(seeded.clubId)
        assertEquals(listOf(teamId), regs.map { it.id })
    }

    @Test
    fun removedTeamDropsItsMaterialRequest() = testComprehension {
        val seeded = seedOpenTeamEvent()
        val teamId = UUID.randomUUID()
        val dto = upsertDto(
            seeded,
            listOf(teamDto(teamId, seeded.namedParticipantId, listOf(seeded.participant1, seeded.participant2))),
        )
        !EventRegistrationService.upsertRegistrationForEvent(seeded.eventId, dto, seeded.user)

        val materialUser = !createTestUser()
        val providerId = (!MaterialService.addProvider(provider(), materialUser) as ApiResponse.Created).id
        val typeId =
            (!MaterialService.addType(MaterialTypeRequest("C4x+", MaterialCategory.BOAT, null), materialUser) as ApiResponse.Created).id
        !MaterialService.inviteProvider(seeded.eventId, providerId, materialUser)
        val offerId = (
            !MaterialService.addOffer(seeded.eventId, providerId, MaterialOfferRequest(typeId, "45 €", 5, 30), materialUser)
                as ApiResponse.Created
            ).id

        !MaterialRequestRepo.create(
            MaterialRequestRecord(
                id = UUID.randomUUID(),
                competitionRegistration = teamId,
                materialOffer = offerId,
                count = 1,
                status = MaterialRequestStatus.REQUESTED.name,
                requestedAt = seedTime,
                createdAt = seedTime,
                updatedAt = seedTime,
            )
        )

        // Zweites Speichern ohne das Team: die Meldung wird gelöscht und diesmal nicht neu
        // angelegt - der Fall, für den Task 1.1 den aufgeschobenen Trigger gebaut hat.
        val dtoWithoutTeam = upsertDto(seeded, emptyList())
        !EventRegistrationService.upsertRegistrationForEvent(seeded.eventId, dtoWithoutTeam, seeded.user)

        // testComprehension rollt am Ende zurück, der aufgeschobene Trigger feuert also nie von
        // selbst beim Commit - "set constraints all immediate" erzwingt die Prüfung innerhalb der
        // laufenden Transaktion. Ohne Fremdschlüssel auf material_request.competition_registration
        // konkurriert dabei keine automatische Postgres-Prüfung mehr mit dem Aufräum-Trigger.
        !Jooq.query { execute("set constraints all immediate") }
        // Kein Wurf bis hierher: Der Trigger ist gelaufen, ohne dass eine Fremdschlüsselverletzung
        // die Transaktion abgebrochen hat.
        assertTrue(true)

        val remainingRequests = !MaterialRequestRepo.forRegistration(teamId)
        assertTrue(remainingRequests.isEmpty())
    }
}
