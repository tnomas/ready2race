import {darken, getContrastRatio, getLuminance, lighten} from '@mui/material/styles'

/** WCAG-Mindestkontrast für normalen Text (AA). */
export const MIN_TEXT_CONTRAST = 4.5

/** Schrittweite je Abdunklungs- bzw. Aufhellungsschritt (Anteil, 0–1). */
const STEP = 0.05

/** Deckel gegen Endlosschleifen: nach so vielen Schritten ist jede Farbe fast Schwarz bzw. Weiß. */
const MAX_STEPS = 60

const BLACK = '#000000'
const WHITE = '#ffffff'

/**
 * Leitet aus einer Mandantenfarbe eine Variante ab, die auf [background] als Text oder Icon
 * lesbar ist (mindestens [min]:1 Kontrast).
 *
 * Erreicht [color] den Kontrast schon, kommt sie unverändert zurück. Sonst wird sie in kleinen
 * Schritten abgedunkelt (heller Grund) bzw. aufgehellt (dunkler Grund), bis der Kontrast reicht –
 * so bleibt der Farbton der Marke erkennbar. Reicht auch das nicht (etwa bei mittelgrauem Grund),
 * fällt die Funktion auf Schwarz oder Weiß zurück, je nachdem, was mehr Kontrast hat.
 *
 * Reine Funktion; für Farben, die nicht im Theme liegen (z. B. aus Daten), direkt nutzbar.
 */
export const readableColor = (
    color: string,
    background: string,
    min: number = MIN_TEXT_CONTRAST,
): string => {
    if (getContrastRatio(color, background) >= min) {
        return color
    }
    const towardsDark = getLuminance(background) > 0.18
    for (let i = 1; i <= MAX_STEPS; i++) {
        const amount = Math.min(1, i * STEP)
        const candidate = towardsDark ? darken(color, amount) : lighten(color, amount)
        if (getContrastRatio(candidate, background) >= min) {
            return candidate
        }
    }
    return getContrastRatio(BLACK, background) >= getContrastRatio(WHITE, background)
        ? BLACK
        : WHITE
}

/**
 * Schriftfarbe für eine farbige Fläche (z. B. Primärknopf): Weiß, wenn es [min]:1 schafft,
 * sonst die Kandidatin mit dem höheren Kontrast aus Weiß und [darkText].
 */
export const contrastTextOn = (
    surface: string,
    darkText: string,
    min: number = MIN_TEXT_CONTRAST,
): string => {
    const white = getContrastRatio(WHITE, surface)
    if (white >= min) {
        return WHITE
    }
    return getContrastRatio(darkText, surface) > white ? darkText : WHITE
}
