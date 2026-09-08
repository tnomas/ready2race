package de.lambda9.ready2race.backend.app.material.entity

import de.lambda9.ready2race.backend.database.generated.tables.references.MATERIAL_DAMAGE_VIEW
import de.lambda9.ready2race.backend.pagination.Sortable
import org.jooq.Field

enum class MaterialDamageSort : Sortable {
    REPORTED_AT,
    ITEM,
    SEVERITY,
    STATUS;

    override fun toFields(): List<Field<*>> = when (this) {
        REPORTED_AT -> listOf(MATERIAL_DAMAGE_VIEW.REPORTED_AT)
        ITEM -> listOf(MATERIAL_DAMAGE_VIEW.ITEM_LABEL)
        SEVERITY -> listOf(MATERIAL_DAMAGE_VIEW.SEVERITY)
        STATUS -> listOf(MATERIAL_DAMAGE_VIEW.STATUS)
    }
}
