package de.lambda9.ready2race.backend.app.competitionExecution.entity

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.club.boundary.ClubComposition
import de.lambda9.ready2race.backend.app.competitionExecution.boundary.CompetitionExecutionService
import de.lambda9.ready2race.backend.app.substitution.control.toParticipantForExecutionDto
import de.lambda9.ready2race.backend.database.generated.enums.Gender
import de.lambda9.ready2race.backend.database.generated.tables.records.StartlistTeamRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.StartlistViewRecord
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.traverse
import java.time.LocalDateTime
import java.util.UUID
import kotlin.String

data class CompetitionMatchData(
    val matchName: String?,
    val roundName: String,
    val order: Int,
    val startTime: LocalDateTime?,
    val startTimeOffset: Long?,
    val competition: CompetitionData,
    val teams: List<CompetitionMatchTeam>,
) {

    data class CompetitionData(
        val identifier: String,
        val name: String,
        val shortName: String?,
        val category: String?,
    )

    data class CompetitionMatchTeam(
        val registrationId: UUID,
        /**
         * Unique per team *and* round, unlike [registrationId]. Exported as the round-trip key for
         * tooling that keeps every round of a competition in one race (RaceClocker), where the
         * registration id alone would be ambiguous.
         */
        val matchTeamId: UUID,
        val startNumber: Int,
        /** Der meldende Verein - reine Verwaltung, siehe [actualClubName]. */
        val registeringClubName: String,
        /**
         * Die Vereine, die die Crew trägt, als Kette in Bootsreihenfolge; bei einem reinen
         * Vereinsboot schlicht dieser eine Verein. Ersatzweise der meldende Verein.
         */
        val actualClubName: String,
        val teamName: String?,
        val ratingCategory: CompetitionMatchTeamRatingCategory?,
        val participants: List<CompetitionMatchParticipant>,
        val deregistered: Boolean,
    )

    data class CompetitionMatchTeamRatingCategory(
        val id: UUID,
        val name: String,
    )

    data class CompetitionMatchParticipant(
        val role: String,
        val firstname: String,
        val lastname: String,
        val year: Int,
        val gender: Gender,
        val externalClubName: String?,
        /** Der Verein, den diese Person trägt - ihr eigener, bei Gastruderern der Freitext. */
        val wornClubName: String?,
    )

    companion object {

        /**
         * This expects startTime to be set and not be null.
         */
        fun fromPersisted(
            persisted: StartlistViewRecord,
        ): App<Nothing, CompetitionMatchData> = persisted.teams!!.toList().traverse {
            it!!.toData()
        }.map { teams ->
            CompetitionMatchData(
                matchName = persisted.name,
                roundName = persisted.roundName!!,
                order = persisted.executionOrder!!,
                startTime = persisted.startTime,
                startTimeOffset = persisted.startTimeOffset,
                competition = CompetitionData(
                    identifier = persisted.competitionIdentifier!!,
                    name = persisted.competitionName!!,
                    shortName = persisted.competitionShortName,
                    category = persisted.competitionCategory,
                ),
                teams = teams
            )
        }

        private fun StartlistTeamRecord.toData(): App<Nothing, CompetitionMatchTeam> = KIO.comprehension {

            val participantsWithData = participants!!.filterNotNull().map{
                !it.toParticipantForExecutionDto(
                    clubId = clubId!!,
                    clubName = clubName!!,
                    registrationId = teamId!!,
                    registrationName = teamName,
                )
            }

            val actuallyParticipatingParticipants = !CompetitionExecutionService.getActuallyParticipatingParticipants(
                teamParticipants = participantsWithData,
                substitutionsForRegistration = substitutions!!.filterNotNull(),
            ).map { list ->
                // Die View liefert die Crew aus einem `array_agg`, und die Ummeldungen hängen ihre
                // Ersatzleute hinten an - beides ohne Ordnung. Erst hier steht das Boot.
                ClubComposition.inBoatOrder(
                    list,
                    role = { it.namedParticipantName },
                    lastName = { it.lastName },
                    id = { it.id },
                ).map { p ->
                    CompetitionMatchParticipant(
                        role = p.namedParticipantName,
                        firstname = p.firstName,
                        lastname = p.lastName,
                        year = p.year,
                        gender = p.gender,
                        externalClubName = p.externalClubName,
                        wornClubName = ClubComposition.clubWorn(p.external, p.externalClubName, p.ownClubName),
                    )
                }
            }

            // Bis zum 26.08.2026 stand hier bei gemischter Crew das pauschale `mixedTeamTerm`
            // ("Renngemeinschaft") - und nur dann, wenn die Crew GASTRUDERER verschiedener Vereine
            // enthielt: Die alte Ableitung sah ausschließlich `external_club_name`. Eine Meldung
            // aus mehreren gepflegten Vereinen (V202608142000) trug dort überall null, galt damit
            // als eindeutig und stand am Ende unter dem meldenden Verein.
            val actualClubName = ClubComposition.fullLine(
                actuallyParticipatingParticipants.map { it.wornClubName },
                clubName!!,
            )

            KIO.ok(
                CompetitionMatchTeam(
                    registrationId = teamId!!,
                    matchTeamId = matchTeamId!!,
                    startNumber = startNumber!!,
                    registeringClubName = clubName!!,
                    actualClubName = actualClubName,
                    teamName = teamName,
                    deregistered = deregistered == true,
                    participants = actuallyParticipatingParticipants,
                    ratingCategory = ratingCategory?.let {
                        CompetitionMatchTeamRatingCategory(
                            id = it.id,
                            name = it.name,
                        )
                    }
                )
            )
        }
    }
}
