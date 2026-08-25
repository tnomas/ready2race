import {TimingCaptureMode} from '@api/types.gen.ts'

/**
 * Darf dieser Posten gerade mit Zuordnung erfassen?
 *
 * Eine Zeile, aber sie wird an vier Stellen gebraucht (Boots-Knöpfe, Boots-Tasten, Leertaste,
 * Warnbalken). Viermal dieselbe Bedingung von Hand ist die Art Fehler, bei der später genau eine
 * davon vergessen wird — und ein Schlupfloch in einer Sicherung ist schlimmer als keine Sicherung.
 *
 * Gilt NICHT für den großen Erfassungsknopf: Der bankt eine Zeit ohne Zuordnung und ist die
 * Notlösung für den vergessenen Scharfschalter. Er wird nie gesperrt.
 */
export const captureAllowed = (mode: TimingCaptureMode, armed: boolean): boolean =>
    mode === 'ONETOUCH' || armed
