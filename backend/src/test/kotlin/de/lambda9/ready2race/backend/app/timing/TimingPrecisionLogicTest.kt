package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.timing.boundary.TimingPrecisionLogic
import de.lambda9.ready2race.backend.app.timingConfig.entity.TimingPrecision
import de.lambda9.ready2race.backend.data.Timecode
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Das Abschneiden offizieller Zeiten als reine Logik: nie kaufmaennisch, die veroeffentlichte Zeit
 * ist nie schneller als die gemessene -- und Strafen gehen VOR dem Abschneiden in die Summe ein.
 */
class TimingPrecisionLogicTest {

    private fun cut(millis: Long, precision: TimingPrecision) =
        TimingPrecisionLogic.truncate(millis, precision)

    // ------------------------------------------------------------- alle vier Stufen

    @Test
    fun truncatesToEveryLevel() {
        val measured = 91_578L // 1:31.578
        assertEquals(91_000L, cut(measured, TimingPrecision.SEKUNDE))
        assertEquals(91_500L, cut(measured, TimingPrecision.ZEHNTEL))
        assertEquals(91_570L, cut(measured, TimingPrecision.HUNDERTSTEL))
        assertEquals(91_578L, cut(measured, TimingPrecision.MILLISEKUNDE))
    }

    @Test
    fun exactValuesStayUntouched() {
        assertEquals(90_000L, cut(90_000L, TimingPrecision.SEKUNDE))
        assertEquals(90_000L, cut(90_000L, TimingPrecision.ZEHNTEL))
        assertEquals(90_500L, cut(90_500L, TimingPrecision.ZEHNTEL))
    }

    // Kaufmaennisch waere 91_578 -> 92_000 bzw. 91_600: beides waere schneller als gemessen.
    @Test
    fun neverRoundsUp() {
        assertEquals(91_000L, cut(91_999L, TimingPrecision.SEKUNDE))
        assertEquals(91_900L, cut(91_999L, TimingPrecision.ZEHNTEL))
        assertEquals(91_990L, cut(91_999L, TimingPrecision.HUNDERTSTEL))
    }

    // ------------------------------------------------------------- Randfaelle 999 ms

    @Test
    fun subSecondEdgeCases() {
        assertEquals(0L, cut(999L, TimingPrecision.SEKUNDE))
        assertEquals(900L, cut(999L, TimingPrecision.ZEHNTEL))
        assertEquals(990L, cut(999L, TimingPrecision.HUNDERTSTEL))
        assertEquals(999L, cut(999L, TimingPrecision.MILLISEKUNDE))
        assertEquals(0L, cut(0L, TimingPrecision.SEKUNDE))
    }

    // ------------------------------------------------------------- Strafe vor dem Abschneiden

    // Die Uebernahme schneidet die SUMME ab (Basis + Strafe), nicht die Teile einzeln: sonst
    // koennten Reste verschieden fallen und ein ehrlicher Gleichstand wieder auseinanderlaufen.
    @Test
    fun penaltyIsAddedBeforeTruncating() {
        val base = 90_044L
        val penalty = 5_500L
        assertEquals(95_500L, cut(base + penalty, TimingPrecision.ZEHNTEL))
        assertEquals(95_000L, cut(base + penalty, TimingPrecision.SEKUNDE))
        // Einzeln abgeschnitten und dann addiert ergaebe bei SEKUNDE 90_000 + 5_000 = 95_000 --
        // hier zufaellig gleich, aber bei 90_600 + 5_600 = 96_200 -> Summe 96_000 vs. 95_000+5_000.
        assertEquals(96_000L, cut(90_600L + 5_600L, TimingPrecision.SEKUNDE))
    }

    // ------------------------------------------------------------- Gleichstands-Ehrlichkeit

    // Zwei Boote 40 ms auseinander sind bei ZEHNTEL zeitgleich -- exakt derselbe Wert am Lauf.
    @Test
    fun closeFinishesTieOnCoarserLevels() {
        val first = 91_510L
        val second = 91_550L
        assertEquals(cut(first, TimingPrecision.ZEHNTEL), cut(second, TimingPrecision.ZEHNTEL))
        assertEquals(91_500L, cut(second, TimingPrecision.ZEHNTEL))
        // Bei MILLISEKUNDE bleiben sie unterscheidbar.
        assertEquals(91_510L, cut(first, TimingPrecision.MILLISEKUNDE))
        assertEquals(91_550L, cut(second, TimingPrecision.MILLISEKUNDE))
    }

    // ------------------------------------------------------------- Timecode-Rendering

    // Am Lauf soll "1:31.5" stehen, nicht "1:31.500" -- die Stellenzahl folgt der Stufe.
    @Test
    fun timecodePrecisionMatchesLevel() {
        assertEquals(Timecode.MillisecondPrecision.NONE, TimingPrecisionLogic.timecodePrecision(TimingPrecision.SEKUNDE))
        assertEquals(Timecode.MillisecondPrecision.ONE, TimingPrecisionLogic.timecodePrecision(TimingPrecision.ZEHNTEL))
        assertEquals(Timecode.MillisecondPrecision.TWO, TimingPrecisionLogic.timecodePrecision(TimingPrecision.HUNDERTSTEL))
        assertEquals(Timecode.MillisecondPrecision.THREE, TimingPrecisionLogic.timecodePrecision(TimingPrecision.MILLISEKUNDE))
    }
}
