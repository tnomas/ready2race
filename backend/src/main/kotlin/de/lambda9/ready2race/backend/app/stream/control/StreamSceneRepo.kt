package de.lambda9.ready2race.backend.app.stream.control

import de.lambda9.ready2race.backend.database.*
import de.lambda9.ready2race.backend.database.generated.tables.records.StreamSceneGraphicRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.StreamSceneRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.STREAM_SCENE
import de.lambda9.ready2race.backend.database.generated.tables.references.STREAM_SCENE_GRAPHIC
import de.lambda9.tailwind.jooq.JIO
import de.lambda9.tailwind.jooq.Jooq
import java.util.UUID

object StreamSceneRepo {

    fun create(record: StreamSceneRecord): JIO<StreamSceneRecord> = STREAM_SCENE.insertReturning(record)

    fun findById(id: UUID) = STREAM_SCENE.selectOne { ID.eq(id) }

    /** Aufsteigend nach Anlagedatum - eine stabile Reihenfolge für die Verwaltungsliste. */
    fun findByEvent(eventId: UUID): JIO<List<StreamSceneRecord>> = Jooq.query {
        selectFrom(STREAM_SCENE)
            .where(STREAM_SCENE.EVENT.eq(eventId))
            .orderBy(STREAM_SCENE.CREATED_AT.asc(), STREAM_SCENE.ID.asc())
            .fetch()
    }

    fun update(id: UUID, f: StreamSceneRecord.() -> Unit) = STREAM_SCENE.update(f) { ID.eq(id) }

    fun delete(id: UUID) = STREAM_SCENE.delete { ID.eq(id) }

    fun getGraphics(sceneId: UUID) = STREAM_SCENE_GRAPHIC.select { SCENE.eq(sceneId) }

    /** Für [de.lambda9.ready2race.backend.app.stream.boundary.StreamSceneService.getScenes]: eine Abfrage für alle Szenen der Liste statt einer je Szene. */
    fun getGraphicsByScenes(sceneIds: Collection<UUID>): JIO<List<StreamSceneGraphicRecord>> = Jooq.query {
        if (sceneIds.isEmpty()) return@query emptyList()
        selectFrom(STREAM_SCENE_GRAPHIC)
            .where(STREAM_SCENE_GRAPHIC.SCENE.`in`(sceneIds))
            .fetch()
    }

    /**
     * Ersetzt die Konfigurationszeile eines Grafiktyps komplett (Löschen+Einfügen statt eines
     * echten `ON CONFLICT`-Upserts): [StreamSceneGraphicDto][de.lambda9.ready2race.backend.app.stream.entity.StreamSceneGraphicDto]
     * führt keine eigene Zeilen-Kennung, die `id` der Zeile ist reines Tabellendetail und darf
     * bei jeder Änderung eine neue sein - der eindeutige Schlüssel bleibt `(scene, type)`.
     */
    fun upsertGraphic(record: StreamSceneGraphicRecord): JIO<Unit> = Jooq.query {
        deleteFrom(STREAM_SCENE_GRAPHIC)
            .where(STREAM_SCENE_GRAPHIC.SCENE.eq(record.scene).and(STREAM_SCENE_GRAPHIC.TYPE.eq(record.type)))
            .execute()
        insertInto(STREAM_SCENE_GRAPHIC)
            .set(record)
            .execute()
        Unit
    }
}
