package de.lambda9.ready2race.backend.app.competitionProperties.control

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.competitionProperties.entity.*
import de.lambda9.ready2race.backend.app.material.entity.MaterialCategory
import de.lambda9.ready2race.backend.app.material.entity.MaterialDemandDto
import de.lambda9.ready2race.backend.app.material.entity.MaterialDemandRequestDto
import de.lambda9.ready2race.backend.database.generated.tables.records.*
import de.lambda9.tailwind.core.KIO
import java.util.*

fun CompetitionPropertiesRequest.toRecord(competitionId: UUID?, competitionTemplateId: UUID?) =
    CompetitionPropertiesRecord(
        id = UUID.randomUUID(),
        competition = competitionId,
        competitionTemplate = competitionTemplateId,
        identifier = identifier,
        name = name,
        shortName = shortName,
        checkInOutRequired = checkInOutRequired,
        description = description,
        competitionCategory = competitionCategory,
        lateRegistrationAllowed = lateRegistrationAllowed,
        ratingCategoryRequired = ratingCategoryRequired,
        distanceMeters = distanceMeters,
        paceReference = paceReference,
    )

fun NamedParticipantForCompetitionRequestDto.toRecord(propertiesId: UUID) =
    CompetitionPropertiesHasNamedParticipantRecord(
        competitionProperties = propertiesId,
        namedParticipant = namedParticipant,
        countMales = countMales,
        countFemales = countFemales,
        countNonBinary = countNonBinary,
        countMixed = countMixed
    )

fun FeeForCompetitionRequestDto.toRecord(propertiesId: UUID) = CompetitionPropertiesHasFeeRecord(
    id = UUID.randomUUID(),
    competitionProperties = propertiesId,
    fee = fee,
    required = required,
    amount = amount,
    lateAmount = lateAmount,
)

fun MaterialDemandRequestDto.toRecord(propertiesId: UUID) = CompetitionPropertiesHasMaterialTypeRecord(
    competitionProperties = propertiesId,
    materialType = materialType,
    count = count,
)

fun NamedParticipantForCompetitionPropertiesRecord.toDto(): App<Nothing, NamedParticipantForCompetitionDto> = KIO.ok(
    NamedParticipantForCompetitionDto(
        id = id!!,
        name = name!!,
        description = description,
        countMales = countMales!!,
        countFemales = countFemales!!,
        countNonBinary = countNonBinary!!,
        countMixed = countMixed!!
    )
)

fun FeeForCompetitionPropertiesRecord.toDto(): App<Nothing, FeeForCompetitionDto> = KIO.ok(
    FeeForCompetitionDto(
        id = id!!,
        assignmentId = assignmentId!!,
        name = name!!,
        description = description,
        required = required!!,
        amount = amount!!,
        lateAmount = lateAmount,
    )
)

fun MaterialDemandForCompetitionPropertiesRecord.toDto(): App<Nothing, MaterialDemandDto> = KIO.ok(
    MaterialDemandDto(
        materialType = materialType!!,
        name = name!!,
        category = MaterialCategory.valueOf(category!!),
        count = count!!,
    )
)

fun CompetitionPropertiesRequest.toUpdateFunction(): CompetitionPropertiesRecord.() -> Unit = let {
    {
        identifier = it.identifier
        name = it.name
        shortName = it.shortName
        checkInOutRequired = it.checkInOutRequired
        description = it.description
        competitionCategory = it.competitionCategory
        lateRegistrationAllowed = it.lateRegistrationAllowed
        ratingCategoryRequired = it.ratingCategoryRequired
        distanceMeters = it.distanceMeters
        paceReference = it.paceReference
    }
}

fun CompetitionChallengeConfigRequest.toRecord(propertiesId: UUID) = KIO.ok(
    CompetitionPropertiesChallengeConfigRecord(
        competitionProperties = propertiesId,
        resultConfirmationImageRequired = resultConfirmationImageRequired,
        startAt = startAt,
        endAt = endAt,
    )
)