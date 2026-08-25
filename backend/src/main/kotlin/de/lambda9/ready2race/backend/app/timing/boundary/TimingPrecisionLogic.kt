package de.lambda9.ready2race.backend.app.timing.boundary

import de.lambda9.ready2race.backend.app.timingConfig.entity.TimingPrecision
import de.lambda9.ready2race.backend.data.Timecode

/**
 * Das Abschneiden offizieller Zeiten auf die eingestellte Genauigkeit, als reine Logik (Muster
 * [TimingApplyLogic]).
 *
 * **Abschneiden, nie kaufmaennisch runden:** die veroeffentlichte Zeit darf nie schneller sein als
 * die gemessene. 1:31.578 wird bei ZEHNTEL zu 1:31.5 -- niemals zu 1:31.6.
 *
 * **Strafen vor dem Abschneiden:** die Uebernahme rechnet erst `Basiszeit + Strafe` und schneidet
 * dann ab (siehe `TimingOfficialTimeService.targetState` -- dort geht bereits die Summe
 * `effectiveMillis` hinein). Wuerde einzeln abgeschnitten und dann addiert, koennten zwei Boote,
 * die auf der veroeffentlichten Genauigkeit zeitgleich sind, durch verschieden fallende Reste
 * wieder auseinanderlaufen.
 *
 * Ergebnis: Gleichstaende sind auf der veroeffentlichten Genauigkeit ehrlich -- zwei Boote, deren
 * abgeschnittene Zeiten uebereinstimmen, stehen mit exakt derselben Zeit am Lauf.
 */
object TimingPrecisionLogic {

    /** Schrittweite der Stufe in Millisekunden. */
    private fun stepMillis(precision: TimingPrecision): Long = when (precision) {
        TimingPrecision.SEKUNDE -> 1000L
        TimingPrecision.ZEHNTEL -> 100L
        TimingPrecision.HUNDERTSTEL -> 10L
        TimingPrecision.MILLISEKUNDE -> 1L
    }

    /**
     * Schneidet [millis] auf [precision] ab (Ganzzahldivision Richtung minus unendlich, damit auch
     * ein -- fachlich nicht vorkommender -- negativer Wert nie "schneller" wuerde).
     */
    fun truncate(millis: Long, precision: TimingPrecision): Long {
        val step = stepMillis(precision)
        return Math.floorDiv(millis, step) * step
    }

    /**
     * Die [Timecode.MillisecondPrecision], mit der ein an den Lauf geschriebener Timecode gerendert
     * wird: genau die eingestellten Stellen, damit am Lauf "1:31.5" steht und nicht "1:31.500".
     */
    fun timecodePrecision(precision: TimingPrecision): Timecode.MillisecondPrecision = when (precision) {
        TimingPrecision.SEKUNDE -> Timecode.MillisecondPrecision.NONE
        TimingPrecision.ZEHNTEL -> Timecode.MillisecondPrecision.ONE
        TimingPrecision.HUNDERTSTEL -> Timecode.MillisecondPrecision.TWO
        TimingPrecision.MILLISEKUNDE -> Timecode.MillisecondPrecision.THREE
    }
}
