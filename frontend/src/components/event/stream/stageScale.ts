/** Feste Entwurfsgröße der Bühne — Grafiken (Task 10–12) legen gegen diese Größe in Pixeln auf. */
export const STREAM_STAGE_WIDTH = 1920
export const STREAM_STAGE_HEIGHT = 1080

/**
 * Der einheitliche Maßstab, mit dem die feste 1920×1080-Bühne in ein Fenster beliebigen
 * Zuschnitts passt — die enger begrenzende der beiden Achsen entscheidet, die andere lässt Rand
 * (Letterboxing). Ohne diese Begrenzung liefe die Bühne in einem Hochformat-Fenster (Vorschau
 * auf einem Tablet) seitlich aus dem sichtbaren Bereich, statt oben/unten leer zu bleiben.
 */
export const stageScale = (windowWidth: number, windowHeight: number): number => {
    if (!(windowWidth > 0) || !(windowHeight > 0)) return 1
    return Math.min(windowWidth / STREAM_STAGE_WIDTH, windowHeight / STREAM_STAGE_HEIGHT)
}
