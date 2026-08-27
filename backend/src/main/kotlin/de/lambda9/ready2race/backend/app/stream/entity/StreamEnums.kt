package de.lambda9.ready2race.backend.app.stream.entity

/** Grafiktyp einer Szenen-Einblendung — deckungsgleich mit dem Check-Constraint von `stream_scene_graphic.type`. */
enum class StreamGraphicType { STARTLIST, CLOCK, LAPS, RESULT, FINISH_TICKER, NEXT_UP, SCHEDULE, COURSE_IMAGE }

/** Benannter Anker-Platz auf der Szene — deckungsgleich mit `stream_scene_graphic.placement`. */
enum class StreamPlacement { BOTTOM_CENTER, BOTTOM_LEFT, BOTTOM_RIGHT, TOP_LEFT, TOP_RIGHT, SIDE_LEFT, SIDE_RIGHT, FULL_CENTER }

/** Größenvariante einer Einblendung — deckungsgleich mit `stream_scene_graphic.size`. */
enum class StreamGraphicSize { COMPACT, NORMAL }

/** Bühnenhintergrund einer Szene — deckungsgleich mit `stream_scene.background`. */
enum class StreamBackground { TRANSPARENT, CHROMA }

/**
 * Regie-Zustand einer Einblendung. AUTO existiert nur hier und in der API — er heißt „keine
 * Zeile in `stream_override`", nicht „eine Zeile mit dem Wert AUTO" (siehe Migration
 * V202608271000, dort steht `state` nur `FORCED_ON`/`FORCED_OFF` im Check-Constraint).
 */
enum class StreamOverrideState { AUTO, FORCED_ON, FORCED_OFF }

/** Erlaubte Plätze je Grafiktyp — die Verwaltungs-UI bietet nur diese an, der Service validiert dagegen. */
val allowedPlacements: Map<StreamGraphicType, Set<StreamPlacement>> = mapOf(
    StreamGraphicType.STARTLIST to setOf(StreamPlacement.BOTTOM_CENTER, StreamPlacement.BOTTOM_LEFT, StreamPlacement.BOTTOM_RIGHT),
    StreamGraphicType.CLOCK to setOf(StreamPlacement.TOP_RIGHT, StreamPlacement.TOP_LEFT),
    StreamGraphicType.LAPS to setOf(StreamPlacement.BOTTOM_CENTER, StreamPlacement.BOTTOM_LEFT, StreamPlacement.BOTTOM_RIGHT),
    StreamGraphicType.RESULT to setOf(StreamPlacement.BOTTOM_CENTER, StreamPlacement.FULL_CENTER),
    StreamGraphicType.FINISH_TICKER to setOf(StreamPlacement.SIDE_RIGHT, StreamPlacement.SIDE_LEFT),
    StreamGraphicType.NEXT_UP to setOf(StreamPlacement.BOTTOM_CENTER, StreamPlacement.BOTTOM_LEFT, StreamPlacement.BOTTOM_RIGHT),
    StreamGraphicType.SCHEDULE to setOf(StreamPlacement.FULL_CENTER),
    StreamGraphicType.COURSE_IMAGE to setOf(StreamPlacement.FULL_CENTER),
)
