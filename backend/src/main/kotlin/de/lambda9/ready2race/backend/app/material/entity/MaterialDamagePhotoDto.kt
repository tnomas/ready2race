package de.lambda9.ready2race.backend.app.material.entity

import java.time.LocalDateTime
import java.util.UUID

/** Metadaten eines Schadensfotos - die Bytes gibt es nur einzeln über den Download (Spec Abschnitt 10). */
data class MaterialDamagePhotoDto(
    val id: UUID,
    val name: String,
    val contentType: String,
    val createdAt: LocalDateTime,
)
