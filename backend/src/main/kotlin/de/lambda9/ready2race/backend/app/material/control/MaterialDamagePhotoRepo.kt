package de.lambda9.ready2race.backend.app.material.control

import de.lambda9.ready2race.backend.app.material.entity.MaterialDamagePhotoDto
import de.lambda9.ready2race.backend.database.delete
import de.lambda9.ready2race.backend.database.generated.tables.records.MaterialDamagePhotoRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.MATERIAL_DAMAGE_PHOTO
import de.lambda9.ready2race.backend.database.insert
import de.lambda9.ready2race.backend.database.selectOne
import de.lambda9.tailwind.jooq.JIO
import de.lambda9.tailwind.jooq.Jooq
import java.util.UUID

/** Metadaten der Schadensfotos - die Bytes stehen einzeln in [MaterialDamagePhotoDataRepo]. */
object MaterialDamagePhotoRepo {

    fun create(record: MaterialDamagePhotoRecord) = MATERIAL_DAMAGE_PHOTO.insert(record)

    fun get(id: UUID) = MATERIAL_DAMAGE_PHOTO.selectOne { ID.eq(id) }

    /** Löscht per Kaskade auch die Bytes in `material_damage_photo_data`. */
    fun delete(id: UUID) = MATERIAL_DAMAGE_PHOTO.delete { ID.eq(id) }

    fun listForDamage(damageId: UUID): JIO<List<MaterialDamagePhotoDto>> = Jooq.query {
        fetch(MATERIAL_DAMAGE_PHOTO, MATERIAL_DAMAGE_PHOTO.MATERIAL_DAMAGE.eq(damageId))
            .sortedBy { it.createdAt }
            .map { it.toDto() }
    }

    /** Fotos mehrerer Schäden auf einmal - eine Abfrage statt N+1 beim Seitenladen ([MaterialDamageRepo.page]). */
    fun listForDamages(damageIds: Collection<UUID>): JIO<Map<UUID, List<MaterialDamagePhotoDto>>> = Jooq.query {
        if (damageIds.isEmpty()) {
            emptyMap()
        } else {
            fetch(MATERIAL_DAMAGE_PHOTO, MATERIAL_DAMAGE_PHOTO.MATERIAL_DAMAGE.`in`(damageIds))
                .sortedBy { it.createdAt }
                .groupBy({ it.materialDamage }) { it.toDto() }
        }
    }

    private fun MaterialDamagePhotoRecord.toDto() = MaterialDamagePhotoDto(
        id = id,
        name = name,
        contentType = contentType,
        createdAt = createdAt,
    )
}
