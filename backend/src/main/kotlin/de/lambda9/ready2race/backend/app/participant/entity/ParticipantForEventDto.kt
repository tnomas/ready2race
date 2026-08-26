package de.lambda9.ready2race.backend.app.participant.entity

import de.lambda9.ready2race.backend.app.participantRequirement.entity.CheckedParticipantRequirement
import de.lambda9.ready2race.backend.database.generated.enums.Gender
import java.util.*

data class ParticipantForEventDto(
    val id: UUID,
    /** Der MELDENDE Verein - wer die Person für diese Veranstaltung gemeldet hat. */
    val clubId: UUID,
    /** Der Name des meldenden Vereins, nicht der Verein der Person - siehe [wornClubName]. */
    val clubName: String,
    /**
     * Der Verein, den diese Person trägt: ihr eigener, bei Gastruderern der Freitext aus
     * [externalClubName]. Seit eine Meldung Personen fremder Vereine enthalten darf
     * (V202608142000) ist das nicht dasselbe wie [clubName].
     */
    val wornClubName: String?,
    val firstname: String,
    val lastname: String,
    val year: Int?,
    val gender: Gender,
    val external: Boolean?,
    val externalClubName: String?,
    val participantRequirementsChecked: List<CheckedParticipantRequirement>?,
    val qrCodeId: String?,
    val namedParticipantIds: List<UUID>,
    val email: String?,
    val hasChallengeResults: Boolean?,
)