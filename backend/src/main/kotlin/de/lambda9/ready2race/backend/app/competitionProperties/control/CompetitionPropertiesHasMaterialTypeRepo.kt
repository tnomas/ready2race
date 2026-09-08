package de.lambda9.ready2race.backend.app.competitionProperties.control

import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionPropertiesHasMaterialTypeRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_PROPERTIES_HAS_MATERIAL_TYPE
import de.lambda9.ready2race.backend.database.insert
import de.lambda9.tailwind.jooq.JIO
import de.lambda9.tailwind.jooq.Jooq
import java.util.UUID

/** 1:1 nach CompetitionPropertiesHasFeeRepo - Bedarf am Wettkampf (oder an der Vorlage) statt Gebühr. */
object CompetitionPropertiesHasMaterialTypeRepo {

    fun create(records: Collection<CompetitionPropertiesHasMaterialTypeRecord>) =
        COMPETITION_PROPERTIES_HAS_MATERIAL_TYPE.insert(records)

    fun deleteManyByCompetitionProperties(
        competitionPropertiesId: UUID,
    ): JIO<Int> = Jooq.query {
        with(COMPETITION_PROPERTIES_HAS_MATERIAL_TYPE) {
            deleteFrom(this)
                .where(COMPETITION_PROPERTIES.eq(competitionPropertiesId))
                .execute()
        }
    }
}
