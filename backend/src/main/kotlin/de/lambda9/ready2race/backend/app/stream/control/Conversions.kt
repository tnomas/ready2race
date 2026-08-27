package de.lambda9.ready2race.backend.app.stream.control

import de.lambda9.ready2race.backend.app.stream.entity.StreamBackground
import de.lambda9.ready2race.backend.app.stream.entity.StreamGraphicSettings
import de.lambda9.ready2race.backend.app.stream.entity.StreamGraphicSize
import de.lambda9.ready2race.backend.app.stream.entity.StreamGraphicType
import de.lambda9.ready2race.backend.app.stream.entity.StreamPlacement
import de.lambda9.ready2race.backend.app.stream.entity.StreamSceneDto
import de.lambda9.ready2race.backend.app.stream.entity.StreamSceneGraphicDto
import de.lambda9.ready2race.backend.calls.serialization.jsonMapper
import de.lambda9.ready2race.backend.database.generated.tables.records.StreamSceneGraphicRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.StreamSceneRecord
import org.jooq.JSONB

/**
 * Mapping zwischen den generierten jOOQ-Zeilen und den DTOs aus Task 3 - selbes Muster wie
 * `eventInfo.control.Conversions`, aber mit dem projektweiten [jsonMapper] statt eines eigenen:
 * [StreamGraphicSettings] hat keine Alt-Lesart wie `BoardConfig.layout`, die einen eigenen
 * Mapper mit `NON_NULL` bräuchte.
 */
fun StreamGraphicSettings.toJsonb(): JSONB = JSONB.jsonb(jsonMapper.writeValueAsString(this))

fun JSONB.toGraphicSettings(): StreamGraphicSettings =
    jsonMapper.readValue(data(), StreamGraphicSettings::class.java)

fun StreamSceneGraphicRecord.toDto(): StreamSceneGraphicDto = StreamSceneGraphicDto(
    type = StreamGraphicType.valueOf(type),
    enabled = enabled == true,
    placement = StreamPlacement.valueOf(placement),
    size = size?.let { StreamGraphicSize.valueOf(it) } ?: StreamGraphicSize.NORMAL,
    settings = settings?.toGraphicSettings() ?: StreamGraphicSettings(),
)

fun StreamSceneRecord.toDto(graphics: List<StreamSceneGraphicDto> = emptyList()): StreamSceneDto = StreamSceneDto(
    id = id!!,
    event = event,
    name = name,
    background = background?.let { StreamBackground.valueOf(it) } ?: StreamBackground.TRANSPARENT,
    chromaColor = chromaColor,
    safeAreaPercent = safeAreaPercent ?: 0,
    trialMode = trialMode == true,
    graphics = graphics,
)
