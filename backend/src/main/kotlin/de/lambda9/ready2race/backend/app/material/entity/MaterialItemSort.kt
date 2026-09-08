package de.lambda9.ready2race.backend.app.material.entity

import de.lambda9.ready2race.backend.database.generated.tables.references.MATERIAL_ITEM_VIEW
import de.lambda9.ready2race.backend.pagination.Sortable
import org.jooq.Field

enum class MaterialItemSort : Sortable {
    ID,
    NUMBER,
    LABEL,
    TYPE;

    override fun toFields(): List<Field<*>> = when (this) {
        ID -> listOf(MATERIAL_ITEM_VIEW.ID)
        NUMBER -> listOf(MATERIAL_ITEM_VIEW.NUMBER)
        LABEL -> listOf(MATERIAL_ITEM_VIEW.LABEL)
        TYPE -> listOf(MATERIAL_ITEM_VIEW.MATERIAL_TYPE_NAME)
    }
}
