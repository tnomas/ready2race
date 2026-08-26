package de.lambda9.ready2race.backend.app.substitution.control

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.substitution.entity.ParticipantForExecutionDto
import de.lambda9.ready2race.backend.app.substitution.entity.PossibleSubstitutionParticipantDto
import de.lambda9.ready2race.backend.app.substitution.entity.SubstitutionRequest
import de.lambda9.ready2race.backend.database.generated.tables.records.*
import de.lambda9.tailwind.core.KIO
import java.time.LocalDateTime
import java.util.UUID

fun SubstitutionRequest.toRecord(
    userId: UUID,
    competitionRegistrationId: UUID,
    competitionSetupRound: UUID,
    orderForRound: Long,
    namedParticipant: UUID,
    swapPInWithPOut: Boolean,
): App<Nothing, SubstitutionRecord> = KIO.ok(
    LocalDateTime.now().let { now ->
        SubstitutionRecord(
            id = UUID.randomUUID(),
            competitionRegistration = competitionRegistrationId,
            competitionSetupRound = competitionSetupRound,
            participantOut = if(swapPInWithPOut) {participantIn} else {participantOut},
            participantIn = if(swapPInWithPOut) {participantOut} else {participantIn},
            reason = reason,
            namedParticipant = namedParticipant,
            orderForRound = orderForRound,
            createdAt = now,
            createdBy = userId,
            updatedAt = now,
            updatedBy = userId,
        )
    }
)

/**
 * Die eingewechselte Person, frisch aus `substitution_view` gelesen.
 *
 * [clubId]/[clubName] der View sind der meldende Verein der Mannschaft; der eigene Verein der
 * Person steht daneben in `participant_in_club_name`. Nur so ändert eine Ummeldung aus einem
 * anderen Verein die Vereinskette des Bootes - genau der Fall, der im Betrieb weh tut.
 */
fun SubstitutionViewRecord.toParticipantForExecutionDto(
    participant: ParticipantRecord,
) = KIO.ok(
    ParticipantForExecutionDto(
        id = participant.id,
        namedParticipantId = namedParticipantId!!,
        namedParticipantName = namedParticipantName!!,
        firstName = participant.firstname,
        lastName = participant.lastname,
        year = participant.year,
        gender = participant.gender,
        clubId = clubId!!,
        clubName = clubName!!,
        competitionRegistrationId = competitionRegistrationId!!,
        competitionRegistrationName = competitionRegistrationName,
        external = participant.external,
        externalClubName = participant.externalClubName,
        ownClubName = participantInClubName,
    )
)

fun SubstitutionViewRecord.toParticipantForExecutionDto(
    participant: ParticipantForExecutionDto,
) = KIO.ok(
    ParticipantForExecutionDto(
        id = participant.id,
        namedParticipantId = namedParticipantId!!,
        namedParticipantName = namedParticipantName!!,
        firstName = participant.firstName,
        lastName = participant.lastName,
        year = participant.year,
        gender = participant.gender,
        clubId = clubId!!,
        clubName = clubName!!,
        competitionRegistrationId = competitionRegistrationId!!,
        competitionRegistrationName = competitionRegistrationName,
        external = participant.external,
        externalClubName = participant.externalClubName,
        // Der eigene Verein reist mit der Person, nicht mit der Ummeldung: hier wechselt nur die
        // Mannschaft, in die sie eingesetzt wird.
        ownClubName = participant.ownClubName,
    )
)

/**
 * [clubId]/[clubName] sind der meldende Verein der Mannschaft und kommen deshalb von aussen; der
 * eigene Verein der Person steht in der View selbst (`club_name`) und wird hier nicht überschrieben
 * - `ownClubName = this.clubName` liest ausdrücklich den Empfänger, nicht den Parameter.
 */
fun RegisteredCompetitionTeamParticipantRecord.toParticipantForExecutionDto(
    clubId: UUID,
    clubName: String,
    registrationId: UUID,
    registrationName: String?,
) = KIO.ok(
    ParticipantForExecutionDto(
        id = participantId!!,
        namedParticipantId = roleId!!,
        namedParticipantName = role!!,
        firstName = firstname!!,
        lastName = lastname!!,
        year = year!!,
        gender = gender!!,
        clubId = clubId,
        clubName = clubName,
        competitionRegistrationId = registrationId,
        competitionRegistrationName = registrationName,
        external = external,
        externalClubName = externalClubName,
        ownClubName = this.clubName,
    )
)

fun ParticipantRecord.toPossibleSubstitutionParticipantDto() = KIO.ok(
    PossibleSubstitutionParticipantDto(
        id = id,
        firstName = firstname,
        lastName = lastname,
        year = year,
        gender = gender,
        external = external,
        externalClubName = externalClubName,
        registrationId = null,
        registrationName = null,
        namedParticipantId = null,
        namedParticipantName = null,
    )
)

fun ParticipantForExecutionDto.toPossibleSubstitutionParticipantDto() = KIO.ok(
    PossibleSubstitutionParticipantDto(
        id = id,
        firstName = firstName,
        lastName = lastName,
        year = year,
        gender = gender,
        external = external,
        externalClubName = externalClubName,
        registrationId = competitionRegistrationId,
        registrationName = competitionRegistrationName,
        namedParticipantId = namedParticipantId,
        namedParticipantName = namedParticipantName,
    )
)

fun SubstitutionViewRecord.toPossibleSubstitutionParticipantDto(
    participant: PossibleSubstitutionParticipantDto,
) = KIO.ok(
    PossibleSubstitutionParticipantDto(
        id = participant.id,
        firstName = participant.firstName,
        lastName = participant.lastName,
        year = participant.year,
        gender = participant.gender,
        external = participant.external,
        externalClubName = participant.externalClubName,
        registrationId = competitionRegistrationId!!,
        registrationName = competitionRegistrationName,
        namedParticipantId = namedParticipantId!!,
        namedParticipantName = namedParticipantName!!,
    )
)

fun SubstitutionRecord.applyNewRound(newRoundId: UUID) = KIO.ok(
    this.apply {
        inheritedFrom = inheritedFrom ?: id
        id = UUID.randomUUID()
        competitionSetupRound = newRoundId
    }
)