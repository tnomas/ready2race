import {CaptureToneDto} from '@api/types.gen.ts'
import {DEFAULT_CAPTURE_TONE, TONE_FREQUENCY_MAX_HZ} from '@utils/timing/tonePlan.ts'

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

/**
 * Der Erfassungston einer einzelnen Geste: mit zugeordnetem Boot und eingeschalteter Leiter
 * ([TimingToneSetDto.tonePerBoat]) auf der Stufe dieses Bootes, sonst unverändert der Grundton.
 *
 * Der **unzugeordnete Griff behält den Grundton** — der große Erfassungsknopf bankt eine Zeit
 * ohne Boot, und damit bedeutet der Grundton am Ziel „gebankt, noch ohne Boot". Das ist
 * Information, die nichts kostet: Sie fällt als Nebenprodukt der Leiter an und unterscheidet
 * hörbar die beiden Griffe, die sonst gleich klingen.
 *
 * Verschoben wird ausschließlich die Tonhöhe. Wellenform und Hüllkurve sind die Handschrift des
 * Ton-Satzes; änderte die Leiter sie mit, klänge eine Position wie ein ANDERER Ton statt wie
 * derselbe höher — und genau das Wiedererkennen ist der Zweck.
 *
 * Ohne eingestellten Ton bleibt es ohne Boot bei `undefined` (der Posten klingt exakt wie vor der
 * Leiter); erst mit Boot tritt der eingebaute Standard als Grundton ein.
 */
export function boatCaptureTone(
    tone: CaptureToneDto | undefined,
    tonePerBoat: boolean,
    position: number | undefined,
): CaptureToneDto | undefined {
    if (!tonePerBoat || position === undefined) return tone
    const base = tone ?? DEFAULT_CAPTURE_TONE
    return {...base, frequencyHz: boatPitch(base.frequencyHz, position)}
}
