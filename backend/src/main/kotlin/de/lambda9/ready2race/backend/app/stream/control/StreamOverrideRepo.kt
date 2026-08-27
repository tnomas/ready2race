package de.lambda9.ready2race.backend.app.stream.control

import de.lambda9.ready2race.backend.app.stream.entity.StreamGraphicType
import de.lambda9.ready2race.backend.database.*
import de.lambda9.ready2race.backend.database.generated.tables.records.StreamOverrideRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.STREAM_OVERRIDE
import de.lambda9.tailwind.jooq.JIO
import de.lambda9.tailwind.jooq.Jooq
import java.util.UUID

object StreamOverrideRepo {

    fun findByScene(sceneId: UUID) = STREAM_OVERRIDE.select { SCENE.eq(sceneId) }

    fun findOne(sceneId: UUID, type: StreamGraphicType) =
        STREAM_OVERRIDE.selectOne { SCENE.eq(sceneId).and(GRAPHIC_TYPE.eq(type.name)) }

    /**
     * Ersetzt die Regie-Zeile eines Grafiktyps komplett (Löschen+Einfügen, wie
     * [StreamSceneRepo.upsertGraphic]) - dadurch bekommt jeder Regie-Eingriff ein frisches
     * `created_at`. Das ist Absicht: Der Resolver
     * ([de.lambda9.ready2race.backend.app.stream.boundary.resolveScene]) lässt bei zwei
     * `FORCED_ON`-Grafiken auf demselben Platz die mit dem jüngeren `created_at` gewinnen - ein
     * Eingriff, den die Regie gerade erst gesetzt hat, muss also jünger sein als jeder ältere,
     * auch wenn er denselben Grafiktyp erneut überschreibt.
     */
    fun setOverride(record: StreamOverrideRecord): JIO<Unit> = Jooq.query {
        deleteFrom(STREAM_OVERRIDE)
            .where(STREAM_OVERRIDE.SCENE.eq(record.scene).and(STREAM_OVERRIDE.GRAPHIC_TYPE.eq(record.graphicType)))
            .execute()
        insertInto(STREAM_OVERRIDE)
            .set(record)
            .execute()
        Unit
    }

    fun delete(sceneId: UUID, type: StreamGraphicType) =
        STREAM_OVERRIDE.delete { SCENE.eq(sceneId).and(GRAPHIC_TYPE.eq(type.name)) }
}
