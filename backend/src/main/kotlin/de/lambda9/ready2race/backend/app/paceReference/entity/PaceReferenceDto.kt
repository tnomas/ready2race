package de.lambda9.ready2race.backend.app.paceReference.entity

import java.util.UUID

data class PaceReferenceDto(
    val id: UUID,
    val name: String,
    val mode: PaceReferenceMode,
    /** Bezugsstrecke in Metern; die Beschriftung („/500 m", „km/h") leitet die Oberfläche daraus ab. */
    val referenceMeters: Int,
)
