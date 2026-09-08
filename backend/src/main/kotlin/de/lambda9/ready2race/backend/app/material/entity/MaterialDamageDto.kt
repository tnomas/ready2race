package de.lambda9.ready2race.backend.app.material.entity

import java.time.LocalDateTime
import java.util.UUID

/**
 * Eine Zeile der Schadensakte (Spec Abschnitt 10): Stück und Materialart aufgelöst, Verursacher
 * als Momentaufnahme (`causedByTeam`/`Club`/`Competition` - keine Live-Daten der Meldung, siehe
 * Migration und [MaterialDamageRequest]), Fotos als Metadaten ohne Bytes.
 */
data class MaterialDamageDto(
    val id: UUID,
    val materialItem: UUID,
    val itemLabel: String,
    val itemNumber: Int?,
    val materialTypeName: String,
    val reportedAt: LocalDateTime,
    val reportedByName: String?,
    val description: String,
    val severity: MaterialDamageSeverity,
    val status: MaterialDamageStatus,
    val causedByRegistration: UUID?,
    val causedByTeam: String?,
    val causedByClub: String?,
    val causedByCompetition: String?,
    val outOfServiceFrom: LocalDateTime?,
    val outOfServiceUntil: LocalDateTime?,
    val repairedAt: LocalDateTime?,
    val photos: List<MaterialDamagePhotoDto>,
)
