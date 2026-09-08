package de.lambda9.ready2race.backend.app.stream

import de.lambda9.ready2race.backend.app.stream.entity.StreamBackground
import de.lambda9.ready2race.backend.app.stream.entity.StreamGraphicSettings
import de.lambda9.ready2race.backend.app.stream.entity.StreamGraphicSize
import de.lambda9.ready2race.backend.app.stream.entity.StreamGraphicType
import de.lambda9.ready2race.backend.app.stream.entity.StreamPlacement
import de.lambda9.ready2race.backend.app.stream.entity.StreamSceneGraphicDto
import de.lambda9.ready2race.backend.app.stream.entity.StreamSceneGraphicsRequest
import de.lambda9.ready2race.backend.app.stream.entity.StreamSceneRequest
import de.lambda9.ready2race.backend.validation.ValidationResult
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals

/**
 * Die Grafik-Einstellungen landen als jsonb in der Datenbank und steuern von dort die Bühne:
 * eine negative Zeilenzahl riss den Szenenaufbau (`take(-1)`), eine Einblenddauer von null
 * Sekunden ließe eine Grafik nie erscheinen, eine von Stunden nie verschwinden. Die Grenzen
 * hier sind die einzige Stelle, die das vor dem Schreiben abfängt.
 */
class StreamRequestValidationTest {

    private fun graphics(type: StreamGraphicType, placement: StreamPlacement, settings: StreamGraphicSettings) =
        StreamSceneGraphicsRequest(
            graphics = listOf(
                StreamSceneGraphicDto(
                    type = type,
                    enabled = true,
                    placement = placement,
                    size = StreamGraphicSize.NORMAL,
                    settings = settings,
                ),
            ),
        )

    private fun result(type: StreamGraphicType, placement: StreamPlacement, settings: StreamGraphicSettings) =
        graphics(type, placement, settings).validate()

    @Test
    fun displaySecondsMustLieBetweenOneAndTenMinutes() {
        val type = StreamGraphicType.RESULT
        val placement = StreamPlacement.BOTTOM_CENTER
        assertNotEquals(ValidationResult.Valid, result(type, placement, StreamGraphicSettings(displaySeconds = -1)))
        assertNotEquals(ValidationResult.Valid, result(type, placement, StreamGraphicSettings(displaySeconds = 0)))
        assertNotEquals(ValidationResult.Valid, result(type, placement, StreamGraphicSettings(displaySeconds = 601)))
        assertEquals(ValidationResult.Valid, result(type, placement, StreamGraphicSettings(displaySeconds = 1)))
        assertEquals(ValidationResult.Valid, result(type, placement, StreamGraphicSettings(displaySeconds = 600)))
        // Kein Wert heißt Vorgabe des Grafiktyps - das bleibt gültig.
        assertEquals(ValidationResult.Valid, result(type, placement, StreamGraphicSettings()))
    }

    @Test
    fun listLengthMustLieBetweenOneAndFifty() {
        val type = StreamGraphicType.SCHEDULE
        val placement = StreamPlacement.FULL_CENTER
        assertNotEquals(ValidationResult.Valid, result(type, placement, StreamGraphicSettings(listLength = -1)))
        assertNotEquals(ValidationResult.Valid, result(type, placement, StreamGraphicSettings(listLength = 0)))
        assertNotEquals(ValidationResult.Valid, result(type, placement, StreamGraphicSettings(listLength = 51)))
        assertEquals(ValidationResult.Valid, result(type, placement, StreamGraphicSettings(listLength = 1)))
        assertEquals(ValidationResult.Valid, result(type, placement, StreamGraphicSettings(listLength = 50)))
    }

    @Test
    fun safeAreaPercentMustLieBetweenZeroAndTwenty() {
        fun scene(percent: Int) = StreamSceneRequest(
            name = "Rennen",
            background = StreamBackground.TRANSPARENT,
            safeAreaPercent = percent,
        ).validate()

        assertNotEquals(ValidationResult.Valid, scene(-1))
        assertNotEquals(ValidationResult.Valid, scene(21))
        assertEquals(ValidationResult.Valid, scene(0))
        assertEquals(ValidationResult.Valid, scene(20))
    }
}
