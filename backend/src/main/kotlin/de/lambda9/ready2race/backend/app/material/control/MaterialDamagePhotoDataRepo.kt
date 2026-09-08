package de.lambda9.ready2race.backend.app.material.control

import de.lambda9.ready2race.backend.database.generated.tables.records.MaterialDamagePhotoDataRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.MATERIAL_DAMAGE_PHOTO_DATA
import de.lambda9.ready2race.backend.database.insert
import de.lambda9.ready2race.backend.database.selectOne
import java.util.UUID

/** Die eigentlichen Bytes eines Schadensfotos, getrennt von den Metadaten in `material_damage_photo`. */
object MaterialDamagePhotoDataRepo {

    fun create(record: MaterialDamagePhotoDataRecord) = MATERIAL_DAMAGE_PHOTO_DATA.insert(record)

    fun get(photoId: UUID) = MATERIAL_DAMAGE_PHOTO_DATA.selectOne { MATERIAL_DAMAGE_PHOTO.eq(photoId) }
}
