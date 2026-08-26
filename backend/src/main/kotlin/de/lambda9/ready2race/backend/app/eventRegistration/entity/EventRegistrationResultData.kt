package de.lambda9.ready2race.backend.app.eventRegistration.entity

import de.lambda9.ready2race.backend.app.club.boundary.ClubComposition
import de.lambda9.ready2race.backend.database.generated.enums.Gender
import de.lambda9.ready2race.backend.database.generated.tables.records.EventRegistrationResultViewRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.RegisteredCompetitionTeamRecord
import java.util.UUID

data class EventRegistrationResultData(
    val competitionRegistrations: List<CompetitionRegistrationData>,
) {

    data class CompetitionRegistrationData(
        val identifier: String,
        val name: String,
        val shortName: String?,
        val teams: List<TeamRegistrationData>,
    )

    data class TeamRegistrationData(
        val name: String?,
        val clubId: UUID,
        /** Der meldende Verein - reine Verwaltung, siehe [actualClubName]. */
        val clubName: String,
        /**
         * Die Vereine, die die Crew trägt, als Kette in Bootsreihenfolge; bei einem reinen
         * Vereinsboot schlicht dieser eine Verein. Ersatzweise der meldende Verein.
         */
        val actualClubName: String,
        val ratingCategory: RatingCategoryRegistrationData?,
        val participants: List<ParticipantRegistrationData>,
    )

    data class RatingCategoryRegistrationData(
        val id: UUID,
        val name: String,
    )

    data class ParticipantRegistrationData(
        val role: String,
        val firstname: String,
        val lastname: String,
        val year: Int,
        val gender: Gender,
        val externalClubName: String?,
        /**
         * Der Verein, den diese Person trägt - ihr eigener, bei Gastruderern der Freitext. Steht
         * hier fertig, damit die Meldeansicht nicht wieder auf den meldenden Verein zurückfällt.
         */
        val wornClubName: String?,
    )

    companion object {

        fun fromPersisted(
            result: EventRegistrationResultViewRecord,
            filterTeams: (RegisteredCompetitionTeamRecord) -> Boolean = { true }
        ): EventRegistrationResultData = EventRegistrationResultData(
            competitionRegistrations = result.competitions!!.map { competition ->
                CompetitionRegistrationData(
                    identifier = competition!!.identifier!!,
                    name = competition.name!!,
                    shortName = competition.shortName,
                    teams = competition.teams!!.filter { filterTeams(it!!) }.map { team ->
                        // Die View liefert die Crew aus einem `array_agg` - also in beliebiger
                        // Reihenfolge. Kette und Mannschaftstabelle darunter teilen sich deshalb
                        // diese eine sortierte Liste.
                        val crew = ClubComposition.inBoatOrder(
                            team!!.participants!!.filterNotNull(),
                            role = { it.role!! },
                            lastName = { it.lastname!! },
                            id = { it.participantId!! },
                        )
                        TeamRegistrationData(
                            name = team.teamName,
                            clubId = team.clubId!!,
                            clubName = team.clubName!!,
                            // Bis zum 26.08.2026 stand hier bei gemischter Crew das pauschale
                            // `mixedTeamTerm` ("Renngemeinschaft") - und zwar nur, wenn die Crew
                            // GASTRUDERER verschiedener Vereine enthielt: Die alte Ableitung sah
                            // ausschließlich `external_club_name`. Eine Meldung aus mehreren
                            // gepflegten Vereinen (V202608142000) trug dort überall null, war
                            // damit "eindeutig" und stand am Ende unter dem meldenden Verein.
                            actualClubName = ClubComposition.fullLine(
                                crew.map { ClubComposition.clubWorn(it.external, it.externalClubName, it.clubName) },
                                team.clubName!!,
                            ),
                            ratingCategory = team.ratingCategory?.let {
                                RatingCategoryRegistrationData(
                                    id = it.id,
                                    name = it.name,
                                )
                            },
                            participants = crew.map {
                                ParticipantRegistrationData(
                                    role = it.role!!,
                                    firstname = it.firstname!!,
                                    lastname = it.lastname!!,
                                    year = it.year!!,
                                    gender = it.gender!!,
                                    externalClubName = it.externalClubName,
                                    wornClubName = ClubComposition.clubWorn(
                                        it.external,
                                        it.externalClubName,
                                        it.clubName,
                                    ),
                                )
                            }
                        )
                    }
                )
            }
        )
    }
}
