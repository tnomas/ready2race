package de.lambda9.ready2race.backend.app.paceReference.entity

import de.lambda9.ready2race.backend.database.generated.tables.references.PACE_REFERENCE
import de.lambda9.ready2race.backend.pagination.Sortable
import org.jooq.Field

enum class PaceReferenceSort : Sortable {
    NAME;

    override fun toFields(): List<Field<*>> = when (this) {
        NAME -> listOf(PACE_REFERENCE.NAME)
    }
}
