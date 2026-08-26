import {TONE_FREQUENCY_MAX_HZ} from '@utils/timing/tonePlan.ts'

/**
 * Die Verhältnisse der sechs Stufen: eine pentatonische Leiter über dem Grundton, Position 6
 * genau eine Oktave darüber.
 *
 * Pentatonisch und nicht chromatisch, weil zwei fast gleichzeitige Erfassungen zusammenklingen
 * müssen: Kleine Sekunden und der Tritonus schweben, und ein schwebender Ton am Ziel klingt wie
 * ein Fehler, auch wenn keiner passiert ist.
 */
const BOAT_PITCH_RATIOS: readonly number[] = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2]

/** Wie viele Positionen die Leiter kennt — dieselben sechs, die auch die Tastenreihen ansprechen. */
export const BOAT_PITCH_POSITIONS = BOAT_PITCH_RATIOS.length

/**
 * Die Tonhöhe des Erfassungstons für ein Boot an [position] (1-basiert, wie die Stelle nach
 * Startnummer, die auch die Tastenauflösung benutzt).
 *
 * Ehrlich zur Wirkung: Sechs Tonhöhen sind NICHT absolut erkennbar — niemand hört „das war Boot
 * 4". Zuverlässig hörbar ist das Relative: dass man ein *anderes* Boot getroffen hat als eben
 * (das fängt den Doppeltipp), grob die Lage im Feld, und die Extreme — Position 1 und 6 liegen
 * eine Oktave auseinander.
 *
 * Zwei Randfälle mit Absicht:
 * - Oben wird an der Frequenzgrenze der Editoren GEKAPPT. Ein hoch eingestellter Grundton staucht
 *   die Leiter dadurch oben zusammen, statt über die Grenze hinauszuschießen.
 * - Eine Position außerhalb der sechs ist ein Programmfehler, kein Tonfehler: dann klingt der
 *   Grundton, statt zu raten.
 */
export function boatPitch(base: number, position: number): number {
    const ratio = BOAT_PITCH_RATIOS[position - 1]
    if (ratio === undefined) return base
    return Math.min(Math.round(base * ratio), TONE_FREQUENCY_MAX_HZ)
}
