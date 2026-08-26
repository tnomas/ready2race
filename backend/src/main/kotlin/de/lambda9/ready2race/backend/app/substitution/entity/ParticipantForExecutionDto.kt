package de.lambda9.ready2race.backend.app.substitution.entity

import de.lambda9.ready2race.backend.database.generated.enums.Gender
import java.util.UUID

data class ParticipantForExecutionDto(
    val id: UUID,
    val namedParticipantId: UUID,
    val namedParticipantName: String,
    val firstName: String,
    val lastName: String,
    val year: Int,
    val gender: Gender,
    /** Der MELDENDE Verein der Mannschaft - reine Verwaltung, siehe [ownClubName]. */
    val clubId: UUID,
    /** Der Name des meldenden Vereins der Mannschaft, nicht der Verein dieser Person. */
    val clubName: String,
    val competitionRegistrationId: UUID,
    val competitionRegistrationName: String?,
    val external: Boolean?,
    val externalClubName: String?,
    /**
     * Der eigene Verein DIESER Person. Bei Gastruderern leer - dort steht der Verein als Freitext
     * in [externalClubName]; zusammengesetzt wird beides von `ClubComposition.clubWorn`.
     *
     * Seit eine Meldung Personen fremder Vereine enthalten darf (V202608142000) ist das nicht mehr
     * dasselbe wie [clubName]: Ohne dieses Feld trüge in Meldeansicht, Startliste und Ergebnissen
     * jede Person den Verein, der sie gemeldet hat, und ein vereinsgemischtes Boot sähe wie ein
     * reines Vereinsboot aus.
     */
    val ownClubName: String?,
)