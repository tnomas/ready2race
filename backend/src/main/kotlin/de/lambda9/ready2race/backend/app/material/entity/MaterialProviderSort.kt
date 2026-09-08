package de.lambda9.ready2race.backend.app.material.entity

import de.lambda9.ready2race.backend.database.generated.tables.references.MATERIAL_PROVIDER
import de.lambda9.ready2race.backend.pagination.Sortable
import org.jooq.Field

enum class MaterialProviderSort : Sortable {
    ID,
    NAME;

    override fun toFields(): List<Field<*>> = when (this) {
        ID -> listOf(MATERIAL_PROVIDER.ID)
        NAME -> listOf(MATERIAL_PROVIDER.NAME)
    }
}
