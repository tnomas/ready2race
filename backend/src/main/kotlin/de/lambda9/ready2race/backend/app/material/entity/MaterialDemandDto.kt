package de.lambda9.ready2race.backend.app.material.entity

import java.util.UUID

/** Bedarf einer Materialart am Wettkampf, mit aufgelöstem Namen und Kategorie - keine Nachschlage-Runde in der Anzeige. */
data class MaterialDemandDto(
    val materialType: UUID,
    val name: String,
    val category: MaterialCategory,
    val count: Int,
)
