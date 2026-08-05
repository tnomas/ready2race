package de.lambda9.ready2race.backend.docx

import de.lambda9.ready2race.backend.pdf.AdditionalText
import de.lambda9.ready2race.backend.text.TextAlign
import org.apache.poi.xwpf.usermodel.ParagraphAlignment
import org.apache.poi.xwpf.usermodel.XWPFDocument
import org.apache.pdfbox.pdmodel.common.PDRectangle
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class GapDocumentsDocxTest {

    private fun addition(
        content: String,
        relTop: Double,
        bold: Boolean = false,
        italic: Boolean = false,
    ) = AdditionalText(
        content = content,
        page = 1,
        relLeft = 0.0,
        relTop = relTop,
        relWidth = 1.0,
        relHeight = 0.05,
        textAlign = TextAlign.CENTER,
        fontSize = 20f,
        bold = bold,
        italic = italic,
    )

    private fun doc(pages: List<List<AdditionalText>>) = gapDocumentsDocx(
        pageWidthPoints = PDRectangle.A4.width,
        pageHeightPoints = PDRectangle.A4.height,
        fontName = "TheSansOffice",
        pages = pages,
    )

    @Test
    fun pageSizeIsTakenFromTheTemplateInTwips() {
        val document = doc(listOf(listOf(addition("1. Platz", 0.45))))
        val pgSz = document.document.body.sectPr.pgSz

        // A4 = 595.27563 x 841.8898 pt, 1 pt = 20 twips, gerundet: 11906 x 16838
        assertEquals(11906L, pgSz.w.toString().toLong())
        assertEquals(16838L, pgSz.h.toString().toLong())
        document.close()
    }

    @Test
    fun everyPlaceholderBecomesAFramedParagraph() {
        val document = doc(listOf(listOf(addition("1. Platz", 0.45), addition("Carina Hein", 0.5))))

        val framed = document.paragraphs.filter { it.ctp.pPr?.framePr != null }
        assertEquals(2, framed.size)
        assertEquals(listOf("1. Platz", "Carina Hein"), framed.map { it.text })
        document.close()
    }

    @Test
    fun frameIsAnchoredToThePageAtTheRelativePosition() {
        val document = doc(listOf(listOf(addition("1. Platz", 0.45))))

        val frame = document.paragraphs.first { it.ctp.pPr?.framePr != null }.ctp.pPr.framePr
        assertNotNull(frame)
        // Kastenoberkante = 0.45 * 841.8898 = 378.85 pt, Kastenhöhe = 0.05 * 841.8898 = 42.09 pt,
        // Zeilenhöhe = 20 pt * 1.2 = 24 pt. Eine Zeile, senkrecht zentriert:
        // 378.85 + (42.09 - 24) / 2 = 387.90 pt -> 7758 Twips. Rahmenhöhe = 24 pt -> 480 Twips.
        assertEquals(0L, frame.x.toString().toLong())
        assertEquals(7758L, frame.y.toString().toLong())
        assertEquals(11906L, frame.w.toString().toLong())
        assertEquals(480L, frame.h.toString().toLong())
        document.close()
    }

    @Test
    fun runCarriesFontNameSizeAndStyle() {
        val document = doc(listOf(listOf(addition("1. Platz", 0.45, bold = true, italic = true))))

        val run = document.paragraphs.first { it.ctp.pPr?.framePr != null }.runs.first()
        assertEquals("TheSansOffice", run.fontFamily)
        assertEquals(20, run.fontSize)
        assertTrue(run.isBold)
        assertTrue(run.isItalic)
        document.close()
    }

    @Test
    fun alignmentIsTakenFromTextAlign() {
        val document = gapDocumentsDocx(
            pageWidthPoints = PDRectangle.A4.width,
            pageHeightPoints = PDRectangle.A4.height,
            fontName = null,
            pages = listOf(
                listOf(
                    addition("links", 0.4).copy(textAlign = TextAlign.LEFT),
                    addition("mitte", 0.5).copy(textAlign = TextAlign.CENTER),
                    addition("rechts", 0.6).copy(textAlign = TextAlign.RIGHT),
                )
            ),
        )

        val framed = document.paragraphs.filter { it.ctp.pPr?.framePr != null }
        assertEquals(
            listOf(ParagraphAlignment.LEFT, ParagraphAlignment.CENTER, ParagraphAlignment.RIGHT),
            framed.map { it.alignment },
        )
        document.close()
    }

    @Test
    fun certificatesAreSeparatedByPageBreaks() {
        val document = doc(
            listOf(
                listOf(addition("1. Platz", 0.45)),
                listOf(addition("2. Platz", 0.45)),
                listOf(addition("3. Platz", 0.45)),
            )
        )

        val breaks = document.paragraphs.sumOf { paragraph ->
            paragraph.runs.sumOf { run -> run.ctr.brList.count { it.type?.toString() == "page" } }
        }
        // Zwei Umbrüche für drei Urkunden.
        assertEquals(2, breaks)
        document.close()
    }

    @Test
    fun multipleLinesBecomeStackedFramedParagraphs() {
        val document = doc(listOf(listOf(addition("Carina Hein\nMalte Hein", 0.45))))

        val framed = document.paragraphs.filter { it.ctp.pPr?.framePr != null }
        assertEquals(listOf("Carina Hein", "Malte Hein"), framed.map { it.text })

        // Die zweite Zeile sitzt genau eine Zeilenhöhe (24 pt = 480 Twips) unter der ersten.
        val ys = framed.map { it.ctp.pPr.framePr.y.toString().toLong() }
        assertEquals(480L, ys[1] - ys[0])
        document.close()
    }

    @Test
    fun documentCanBeWrittenAndReadBack() {
        val bytes = doc(listOf(listOf(addition("1. Platz", 0.45)))).toByteArray()

        java.io.File("testOutputs").mkdirs()
        java.io.File("testOutputs/urkunden.docx").writeBytes(bytes)

        val reopened = XWPFDocument(bytes.inputStream())
        assertTrue(reopened.paragraphs.any { it.text == "1. Platz" })
        reopened.close()
    }
}
