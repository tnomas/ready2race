package de.lambda9.ready2race.backend.app.certificate.entity

import java.util.UUID

enum class AwardCertificateMode {
    PER_ATHLETE,
    PER_TEAM,
}

data class AwardCertificateOptions(
    val maxPlace: Int,
    val mode: AwardCertificateMode,
    val withBackground: Boolean,
) {
    companion object {
        const val DEFAULT_MAX_PLACE = 3
    }
}

data class AwardCertificateParticipant(
    val firstName: String,
    val lastName: String,
    val role: String,
)

/** Ein platziertes Boot, aufbereitet aus der Platzierungsberechnung. */
data class AwardCertificateTeam(
    val place: Int,
    val clubName: String,
    val teamName: String?,
    val result: String?,
    val startNumber: Int,
    /** abgemeldet, ausgeschieden oder disqualifiziert */
    val excluded: Boolean,
    val participants: List<AwardCertificateParticipant>,
    val registrationId: UUID,
)

/** Eine einzelne Urkunde, also genau eine Seite. */
data class AwardCertificateEntry(
    val place: Int,
    val competitionIdentifier: String,
    val competitionName: String,
    val competitionShortName: String?,
    val clubName: String,
    val teamName: String?,
    val result: String?,
    val names: List<String>,
    val registrationId: UUID,
)
