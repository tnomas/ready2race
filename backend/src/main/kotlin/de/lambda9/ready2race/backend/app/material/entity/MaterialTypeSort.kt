package de.lambda9.ready2race.backend.app.material.entity

import de.lambda9.ready2race.backend.database.generated.tables.references.MATERIAL_TYPE
import de.lambda9.ready2race.backend.pagination.Sortable
import org.jooq.Field

enum class MaterialTypeSort : Sortable {
    ID,
    NAME,
    CATEGORY;

    override fun toFields(): List<Field<*>> = when (this) {
        ID -> listOf(MATERIAL_TYPE.ID)
        NAME -> listOf(MATERIAL_TYPE.NAME)
        CATEGORY -> listOf(MATERIAL_TYPE.CATEGORY)
    }
}
