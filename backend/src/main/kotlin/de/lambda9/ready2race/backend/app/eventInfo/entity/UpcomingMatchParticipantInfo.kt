package de.lambda9.ready2race.backend.app.eventInfo.entity

import java.util.UUID

data class UpcomingMatchParticipantInfo(
    val participantId: UUID,
    val firstName: String,
    val lastName: String,
    val namedRole: String?,
    /** Jahrgang - in Sprecher- und Detail-Anzeigen hinter dem Namen. Das Geschlecht reist bewusst nicht mit: keine Anzeige zeigt es. */
    val year: Int?,
    val externalClubName: String?,
    /** Der getragene Verein (Gastverein vor Heimatverein) — nur für Detail-Anzeigen befüllt. */
    val wornClubName: String? = null
)