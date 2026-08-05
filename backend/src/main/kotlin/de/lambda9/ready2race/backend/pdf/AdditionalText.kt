package de.lambda9.ready2race.backend.pdf

import de.lambda9.ready2race.backend.text.TextAlign

data class AdditionalText(
    val content: String,
    val page: Int,
    val relLeft: Double,
    val relTop: Double,
    val relWidth: Double,
    val relHeight: Double,
    val textAlign: TextAlign,
    val fontSize: Float? = null,
    val bold: Boolean = false,
    val italic: Boolean = false,
)

/**
 * Geometrie, die für einen Platzhalter in beiden Formaten (PDF und DOCX) identisch sein muss: die
 * tatsächlich verwendete Schriftgröße und die daraus abgeleitete Zeilenhöhe. Ist [AdditionalText.fontSize]
 * nicht gesetzt, gilt die Kastenhöhe als Schriftgröße - das ist die einzige Stelle, an der diese Regel
 * definiert ist, damit beide Renderer denselben Punkt auf dem vorgedruckten Papier treffen.
 */
data class GapTextMetrics(
    val fontSize: Float,
    val lineHeight: Float,
)

/** @param boxHeight Höhe des Platzhalterkastens in derselben Einheit wie [AdditionalText.fontSize] (pt). */
fun AdditionalText.gapTextMetrics(boxHeight: Float): GapTextMetrics {
    val fontSize = this.fontSize ?: boxHeight
    return GapTextMetrics(fontSize = fontSize, lineHeight = fontSize * 1.2f)
}
