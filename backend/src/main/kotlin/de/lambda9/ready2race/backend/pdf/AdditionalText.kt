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
