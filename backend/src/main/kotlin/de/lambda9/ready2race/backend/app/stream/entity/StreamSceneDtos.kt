package de.lambda9.ready2race.backend.app.stream.entity

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import java.util.UUID

/** Verwaltungssicht einer Szene mitsamt ihrer Grafik-Konfigurationen. */
data class StreamSceneDto(
    val id: UUID,
    val event: UUID,
    val name: String,
    val background: StreamBackground,
    /** Nur bei [StreamBackground.CHROMA] belegt. */
    val chromaColor: String? = null,
    val safeAreaPercent: Int,
    val trialMode: Boolean,
    val graphics: List<StreamSceneGraphicDto>,
)

/** Konfigurationszeile einer Grafik innerhalb einer Szene — je Szene und Typ genau eine. */
data class StreamSceneGraphicDto(
    val type: StreamGraphicType,
    val enabled: Boolean,
    val placement: StreamPlacement,
    val size: StreamGraphicSize,
    val settings: StreamGraphicSettings,
)

/**
 * Abbild der `settings`-jsonb in `stream_scene_graphic` — je Grafiktyp sind nur die
 * zugehörigen Felder belegt, der Rest bleibt null.
 *
 * `ignoreUnknown`: wie bei [de.lambda9.ready2race.backend.app.eventInfo.entity.BoardElement]
 * liegt die Konfiguration als JSON in der Datenbank; ein später entferntes Feld darf die
 * Deserialisierung eines alten Stands nicht reißen.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
data class StreamGraphicSettings(
    /** LAPS (Default 8), RESULT (Default 20), STARTLIST (Default 15): Einblenddauer in Sekunden. */
    val displaySeconds: Int? = null,
    /** SCHEDULE: Anzahl gezeigter Zeilen, Default 8. */
    val listLength: Int? = null,
    /** COURSE_IMAGE: Referenz auf das hinterlegte Streckenbild. */
    val imageDocument: UUID? = null,
)

/** Regie-Eingriff aus dem Kontroll-Panel; `match`/`seconds` bleiben unbelegt, wenn nicht gesetzt. */
data class StreamOverrideRequest(
    val state: StreamOverrideState,
    /** Inhaltswahl („Ergebnis von Lauf 12"); null = jüngster/aktueller Inhalt. */
    val match: UUID?,
    /** Auto-Out der Handschaltung in Sekunden; null = kein automatischer Rückfall auf AUTO. */
    val seconds: Int?,
)

/** Anlegen/Ändern einer Szene über die Verwaltung — die Grafik-Konfiguration läuft über [updateGraphics][de.lambda9.ready2race.backend.app.stream.boundary.StreamSceneService]. */
data class StreamSceneRequest(
    val name: String,
    val background: StreamBackground = StreamBackground.TRANSPARENT,
    /** Nur bei [StreamBackground.CHROMA] belegt. */
    val chromaColor: String? = null,
    val safeAreaPercent: Int = 0,
)
