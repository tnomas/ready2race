package de.lambda9.ready2race.backend.app.stream.entity

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult
import de.lambda9.ready2race.backend.validation.validate
import de.lambda9.ready2race.backend.validation.validators.CollectionValidators.noDuplicates
import de.lambda9.ready2race.backend.validation.validators.IntValidators
import de.lambda9.ready2race.backend.validation.validators.StringValidators.notBlank
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
) : Validatable {

    override fun validate(): ValidationResult = ValidationResult.allOf(
        this::seconds validate IntValidators.min(1),
    )

    companion object {
        val example = StreamOverrideRequest(
            state = StreamOverrideState.FORCED_ON,
            match = null,
            seconds = 30,
        )
    }
}

/** Anlegen/Ändern einer Szene über die Verwaltung — die Grafik-Konfiguration läuft über [updateGraphics][de.lambda9.ready2race.backend.app.stream.boundary.StreamSceneService]. */
data class StreamSceneRequest(
    val name: String,
    val background: StreamBackground = StreamBackground.TRANSPARENT,
    /** Nur bei [StreamBackground.CHROMA] belegt. */
    val chromaColor: String? = null,
    val safeAreaPercent: Int = 0,
) : Validatable {

    override fun validate(): ValidationResult = ValidationResult.allOf(
        this::name validate notBlank,
        this::safeAreaPercent validate IntValidators.min(0),
        this::safeAreaPercent validate IntValidators.max(100),
        chromaColorResult(),
    )

    // Verschachtelte Regel (hängt von zwei Feldern zugleich ab) - zu viel für die Feld-DSL,
    // dieselbe Ausnahme macht BoardRequest für seine Konfigurationsregeln.
    private fun chromaColorResult(): ValidationResult =
        if (background == StreamBackground.CHROMA && (chromaColor == null || !HEX_COLOR.matches(chromaColor))) {
            ValidationResult.Invalid.Message { "chromaColor must be a hex color when background is CHROMA" }
        } else {
            ValidationResult.Valid
        }

    companion object {
        /** Hex-Farbe in Kurz- oder Langform, wie bei BoardRequest. */
        private val HEX_COLOR = Regex("^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")

        val example = StreamSceneRequest(
            name = "Zieleinlauf",
            background = StreamBackground.TRANSPARENT,
            safeAreaPercent = 5,
        )
    }
}

/** Rumpf von `PUT .../stream/{sceneId}/graphics` — ersetzt die übergebenen Zeilen, siehe [de.lambda9.ready2race.backend.app.stream.boundary.StreamSceneService.updateGraphics]. */
data class StreamSceneGraphicsRequest(
    val graphics: List<StreamSceneGraphicDto>,
) : Validatable {

    override fun validate(): ValidationResult = ValidationResult.allOf(
        // Zwei Zeilen für denselben Typ im selben Aufruf sind kein sinnvoller Auftrag - der
        // Dienst würde stillschweigend nur die letzte übernehmen.
        this::graphics validate noDuplicates(StreamSceneGraphicDto::type),
    )

    companion object {
        val example = StreamSceneGraphicsRequest(
            graphics = listOf(
                StreamSceneGraphicDto(
                    type = StreamGraphicType.STARTLIST,
                    enabled = true,
                    placement = StreamPlacement.BOTTOM_CENTER,
                    size = StreamGraphicSize.NORMAL,
                    settings = StreamGraphicSettings(),
                ),
            ),
        )
    }
}
