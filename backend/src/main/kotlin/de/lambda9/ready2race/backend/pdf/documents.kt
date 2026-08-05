package de.lambda9.ready2race.backend.pdf

import de.lambda9.ready2race.backend.text.TextAlign
import de.lambda9.ready2race.backend.text.sanitizeNonPrintable
import org.apache.pdfbox.Loader
import org.apache.pdfbox.multipdf.LayerUtility
import org.apache.pdfbox.pdmodel.PDDocument
import org.apache.pdfbox.pdmodel.PDPage
import org.apache.pdfbox.pdmodel.PDPageContentStream
import org.apache.pdfbox.pdmodel.common.PDRectangle
import org.apache.pdfbox.pdmodel.font.PDFont
import org.apache.pdfbox.pdmodel.font.PDType0Font
import org.apache.pdfbox.pdmodel.font.PDType1Font
import org.apache.pdfbox.pdmodel.font.Standard14Fonts
import org.apache.pdfbox.pdmodel.graphics.state.RenderingMode
import org.apache.pdfbox.util.Matrix
import java.awt.Color
import java.awt.geom.AffineTransform

private class GapFonts(
    val regular: PDFont,
    val bold: PDFont,
    val italic: PDFont,
    val boldItalic: PDFont,
    /** Bei einer eingebetteten Vorlagenschrift gibt es nur einen Schnitt; Fett und Kursiv werden simuliert. */
    val synthesizeStyles: Boolean,
) {
    fun forStyle(bold: Boolean, italic: Boolean): PDFont = when {
        bold && italic -> boldItalic
        bold -> this.bold
        italic -> this.italic
        else -> regular
    }

    companion object {
        fun load(doc: PDDocument, font: ByteArray?): GapFonts {
            if (font != null) {
                val embedded = PDType0Font.load(doc, font.inputStream())
                return GapFonts(embedded, embedded, embedded, embedded, synthesizeStyles = true)
            }

            return GapFonts(
                regular = PDType1Font(Standard14Fonts.FontName.HELVETICA),
                bold = PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD),
                italic = PDType1Font(Standard14Fonts.FontName.HELVETICA_OBLIQUE),
                boldItalic = PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD_OBLIQUE),
                synthesizeStyles = false,
            )
        }
    }
}

private fun drawAddition(
    doc: PDDocument,
    page: PDPage,
    addition: AdditionalText,
    fonts: GapFonts,
) {
    val content = PDPageContentStream(doc, page, PDPageContentStream.AppendMode.APPEND, true, true)

    val w = (page.mediaBox.width * addition.relWidth).toFloat()
    val h = (page.mediaBox.height * addition.relHeight).toFloat()
    val x = (page.mediaBox.width * addition.relLeft).toFloat()
    val y = (page.mediaBox.height * (1 - addition.relTop) - h).toFloat()

    val fontSize = addition.fontSize ?: h
    val font = fonts.forStyle(addition.bold, addition.italic)

    content.setFont(font, fontSize)
    content.setNonStrokingColor(Color.DARK_GRAY)

    // Ohne echte Schnitte werden Fett und Kursiv nachgebildet: Fett über einen dünnen Rand um die
    // Glyphen, Kursiv über eine Schrägstellung der Textmatrix.
    val synthesizeBold = fonts.synthesizeStyles && addition.bold
    val shear = if (fonts.synthesizeStyles && addition.italic) 0.25f else 0f

    if (synthesizeBold) {
        content.setRenderingMode(RenderingMode.FILL_STROKE)
        content.setStrokingColor(Color.DARK_GRAY)
        content.setLineWidth(fontSize * 0.02f)
    }

    val capHeight = fontSize * font.fontDescriptor.capHeight / 1000
    val lineHeight = fontSize * 1.2f
    val lines = addition.content.split("\n").map { it.sanitizeNonPrintable() }
    val blockTop = y + h / 2 + lineHeight * lines.size / 2

    lines.forEachIndexed { index, line ->
        val textWidth = font.getStringWidth(line) / 1000 * fontSize
        val xOffset = when (addition.textAlign) {
            TextAlign.LEFT -> x
            TextAlign.CENTER -> x + (w - textWidth) / 2
            TextAlign.RIGHT -> x + w - textWidth
        }
        val baseline = blockTop - lineHeight * index - (lineHeight + capHeight) / 2

        content.beginText()
        content.setTextMatrix(Matrix(1f, 0f, shear, 1f, xOffset, baseline))
        content.showText(line)
        content.endText()
    }

    content.close()
}

/**
 * Erzeugt eine Serie: eine Seite je Eintrag in [pages], im Seitenformat der Vorlage.
 *
 * @param withBackground legt die Vorlagenseite als Layer unter den Text. Für den Druck auf
 * vorgedrucktes Papier bleibt das aus, sonst läge das Design doppelt auf dem Blatt.
 * @param font optionale Schriftdatei (TTF/OTF), die eingebettet wird; ohne sie wird Helvetica genutzt.
 */
fun gapDocuments(
    template: ByteArray,
    font: ByteArray?,
    withBackground: Boolean,
    pages: List<List<AdditionalText>>,
): PDDocument {
    val templateDoc = Loader.loadPDF(template)
    val templatePage = templateDoc.getPage(0)
    val format = templatePage.mediaBox

    val result = PDDocument()
    val fonts = GapFonts.load(result, font)

    val layerUtil = if (withBackground) LayerUtility(result) else null
    val templateForm = layerUtil?.importPageAsForm(templateDoc, templatePage)

    pages.forEachIndexed { index, additions ->
        val page = PDPage(format)
        result.addPage(page)

        if (layerUtil != null && templateForm != null) {
            layerUtil.appendFormAsLayer(page, templateForm, AffineTransform(), "template-layer-$index")
        }

        additions.filter { it.page == 1 }.forEach { drawAddition(result, page, it, fonts) }
    }

    templateDoc.close()

    return result
}

/**
 * Befüllt die Vorlage selbst — eine Urkunde, Design inklusive. Wird von der Teilnahmeurkunde genutzt.
 */
fun document(
    original: ByteArray,
    additions: List<AdditionalText>,
): PDDocument {

    val pdf = Loader.loadPDF(original)
    val fonts = GapFonts.load(pdf, null)

    additions.forEach { addition ->
        if (addition.page > pdf.numberOfPages) {
            return@forEach
        }
        drawAddition(pdf, pdf.getPage(addition.page - 1), addition, fonts)
    }

    return pdf
}

fun document(
    pageTemplate: PageTemplate?,
    builder: DocumentBuilder.() -> Unit,
): PDDocument {

    if (pageTemplate == null) {
        return document(builder = builder)
    }

    val templateDoc = Loader.loadPDF(pageTemplate.bytes)
    val templatePage = templateDoc.getPage(0)
    val format = templatePage.mediaBox
    val doc = document(format, pageTemplate.pagepadding, builder)

    val pages = doc.pages

    val resultDoc = PDDocument()
    val layerUtil = LayerUtility(resultDoc)
    val templateForm = layerUtil.importPageAsForm(templateDoc, templatePage)
    val transform = AffineTransform()

    pages.forEachIndexed { i, page ->
        val resultPage = PDPage(format)
        resultDoc.addPage(resultPage)

        val pageForm = layerUtil.importPageAsForm(doc, page)

        layerUtil.appendFormAsLayer(resultPage, templateForm, transform, "template-layer-$i")
        layerUtil.appendFormAsLayer(resultPage, pageForm, transform, "page-layer-$i")
    }

    templateDoc.close()

    return resultDoc
}

fun document(
    format: PDRectangle = PDRectangle.A4,
    pagePadding: Padding = Padding.defaultPagePadding,
    builder: DocumentBuilder.() -> Unit,
): PDDocument {

    val pages = DocumentBuilder(format, pagePadding).apply(builder).pages

    return Document(
        pages = pages,
    ).render()
}
