package de.lambda9.ready2race.backend.app.material.entity

import java.time.LocalDateTime
import java.util.UUID

/**
 * Eine Materialanfrage je Meldung und Angebot, mit aufgelöstem Namen und Anbieter - wie
 * [MaterialOfferDto] keine Nachschlage-Runde in der Anzeige. Wird sowohl im Anmelde-Template
 * (nur lesend) als auch in der Anbieter-Übersicht (Task 4.1) verwendet.
 */
data class MaterialRequestDto(
    val id: UUID,
    val competitionRegistration: UUID,
    val materialOffer: UUID,
    val materialType: UUID,
    val materialTypeName: String,
    val category: MaterialCategory,
    val providerId: UUID,
    val providerName: String,
    val count: Int,
    val status: MaterialRequestStatus,
    val decisionNote: String?,
    val requestedAt: LocalDateTime,
    val decidedAt: LocalDateTime?,
)
