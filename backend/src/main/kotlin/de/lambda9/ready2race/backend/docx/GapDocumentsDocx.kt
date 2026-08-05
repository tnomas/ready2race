package de.lambda9.ready2race.backend.docx

import de.lambda9.ready2race.backend.pdf.AdditionalText
import de.lambda9.ready2race.backend.pdf.gapTextMetrics
import de.lambda9.ready2race.backend.text.TextAlign
import de.lambda9.ready2race.backend.text.sanitizeNonPrintable
import org.apache.poi.xwpf.usermodel.BreakType
import org.apache.poi.xwpf.usermodel.ParagraphAlignment
import org.apache.poi.xwpf.usermodel.XWPFDocument
import org.apache.poi.xwpf.usermodel.XWPFParagraph
import org.openxmlformats.schemas.wordprocessingml.x2006.main.STHAnchor
import org.openxmlformats.schemas.wordprocessingml.x2006.main.STHeightRule
import org.openxmlformats.schemas.wordprocessingml.x2006.main.STVAnchor
import org.openxmlformats.schemas.wordprocessingml.x2006.main.STWrap
import java.io.ByteArrayOutputStream
import java.math.BigInteger
import kotlin.math.roundToInt
import kotlin.math.roundToLong

/** Word rechnet in Twips: 1 Punkt = 20 Twips. */
private const val TWIPS_PER_POINT = 20f

private fun twips(points: Float): BigInteger =
    BigInteger.valueOf(points.times(TWIPS_PER_POINT).roundToLong())

/**
 * Erzeugt eine Urkundenserie als Word-Dokument: eine Seite je Eintrag in [pages], jeder Platzhalter
 * als absolut positionierter Textrahmen (`w:framePr`) an derselben Stelle wie im PDF.
 *
 * Ein Hintergrundbild wird bewusst nicht gesetzt — gedruckt wird auf vorgedrucktes Papier.
 */
fun gapDocumentsDocx(
    pageWidthPoints: Float,
    pageHeightPoints: Float,
    fontName: String?,
    pages: List<List<AdditionalText>>,
): XWPFDocument {
    val document = XWPFDocument()

    val sectPr = document.document.body.addNewSectPr()
    val pgSz = sectPr.addNewPgSz()
    pgSz.w = twips(pageWidthPoints)
    pgSz.h = twips(pageHeightPoints)
    val pgMar = sectPr.addNewPgMar()
    pgMar.top = BigInteger.ZERO
    pgMar.bottom = BigInteger.ZERO
    pgMar.left = BigInteger.ZERO
    pgMar.right = BigInteger.ZERO
    pgMar.header = BigInteger.ZERO
    pgMar.footer = BigInteger.ZERO
    pgMar.gutter = BigInteger.ZERO

    pages.forEachIndexed { pageIndex, additions ->
        // Ein normaler Absatz trägt den Seitenumbruch und verankert den Textfluss auf dieser Seite;
        // die gerahmten Absätze werden daraus herausgelöst und absolut positioniert.
        val anchor = document.createParagraph()
        val anchorRun = anchor.createRun()
        if (pageIndex > 0) {
            anchorRun.addBreak(BreakType.PAGE)
        }

        additions.filter { it.page == 1 }.forEach { addition ->
            val lines = addition.content.split("\n").map { it.sanitizeNonPrintable() }

            // Wie im PDF wird der Textblock senkrecht im Platzhalterkasten zentriert, damit beide
            // Formate dieselbe Stelle auf dem Papier treffen. GapTextMetrics.blockTop ist top-down
            // definiert (Versatz von der Kastenoberkante) - DOCX rechnet ohnehin top-down und
            // verwendet ihn deshalb direkt, ohne weitere Umrechnung.
            val boxTop = pageHeightPoints * addition.relTop.toFloat()
            val boxHeight = pageHeightPoints * addition.relHeight.toFloat()
            val metrics = addition.gapTextMetrics(boxHeight, lines.size)
            val lineHeight = metrics.lineHeight
            val blockTop = boxTop + metrics.blockTop

            lines.forEachIndexed { lineIndex, line ->
                val paragraph = document.createParagraph()
                paragraph.alignment = when (addition.textAlign) {
                    TextAlign.LEFT -> ParagraphAlignment.LEFT
                    TextAlign.CENTER -> ParagraphAlignment.CENTER
                    TextAlign.RIGHT -> ParagraphAlignment.RIGHT
                }

                // Jede Zeile erhält ihren eigenen Rahmen, eine Zeile hoch. Dadurch braucht Word
                // keinen Zeilenumbruch zu berechnen und die Zeilen sitzen exakt wie im PDF.
                applyFrame(
                    paragraph = paragraph,
                    xPoints = pageWidthPoints * addition.relLeft.toFloat(),
                    yPoints = blockTop + lineHeight * lineIndex,
                    widthPoints = pageWidthPoints * addition.relWidth.toFloat(),
                    heightPoints = lineHeight,
                )

                val run = paragraph.createRun()
                run.setText(line)
                fontName?.let { run.fontFamily = it }
                // Wie im PDF-Renderer: ohne konfigurierte Größe wird bei der Kastenhöhe gerendert,
                // sonst würde der sichtbare Text von dem für ihn vorgesehenen Rahmen abweichen.
                run.fontSize = metrics.fontSize.roundToInt()
                run.isBold = addition.bold
                run.isItalic = addition.italic
            }
        }
    }

    return document
}

private fun applyFrame(
    paragraph: XWPFParagraph,
    xPoints: Float,
    yPoints: Float,
    widthPoints: Float,
    heightPoints: Float,
) {
    val pPr = paragraph.ctp.pPr ?: paragraph.ctp.addNewPPr()
    val frame = pPr.framePr ?: pPr.addNewFramePr()
    frame.x = twips(xPoints)
    frame.y = twips(yPoints)
    frame.w = twips(widthPoints)
    frame.h = twips(heightPoints)
    frame.hRule = STHeightRule.AT_LEAST
    frame.hAnchor = STHAnchor.PAGE
    frame.vAnchor = STVAnchor.PAGE
    frame.wrap = STWrap.NOT_BESIDE
}

fun XWPFDocument.toByteArray(): ByteArray {
    val out = ByteArrayOutputStream()
    write(out)
    val bytes = out.toByteArray()
    out.close()
    return bytes
}
