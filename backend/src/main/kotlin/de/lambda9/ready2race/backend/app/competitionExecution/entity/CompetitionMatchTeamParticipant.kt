package de.lambda9.ready2race.backend.app.competitionExecution.entity

import de.lambda9.ready2race.backend.app.club.boundary.ClubComposition
import de.lambda9.ready2race.backend.database.generated.enums.Gender
import java.util.UUID

data class CompetitionMatchTeamParticipant(
    val competitionRegistrationId: UUID,
    val namedParticipantId: UUID,
    val namedParticipantName: String,
    val participantId: UUID,
    val firstName: String,
    val lastName: String,
    val year: Int,
    val gender: Gender,
    val external: Boolean?,
    val externalClubName: String?,
    /**
     * Der eigene Verein dieser Person. Bei Gastruderern ([external]) leer - dort steht der Verein
     * als Freitext in [externalClubName]. Ausdrücklich nicht der meldende Verein der Mannschaft.
     */
    val clubName: String?,
) {

    /**
     * Der Verein, den diese Person *trägt* - die eine Größe, aus der jede Vereinszeile gebaut wird.
     * Abgeleitet statt gespeichert, damit die drei Anzeigen dieses Wegs (Rundenansicht, Plätze,
     * Plätze-CSV) die Regel nicht je einzeln buchstabieren.
     */
    val wornClubName: String? get() = ClubComposition.clubWorn(external, externalClubName, clubName)
}