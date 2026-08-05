package de.lambda9.ready2race.backend.pdf

import de.lambda9.ready2race.backend.text.TextAlign
import org.apache.pdfbox.pdmodel.PDDocument
import org.apache.pdfbox.pdmodel.PDPage
import org.apache.pdfbox.pdmodel.PDPageContentStream
import org.apache.pdfbox.pdmodel.common.PDRectangle
import org.apache.pdfbox.pdmodel.font.PDType1Font
import org.apache.pdfbox.pdmodel.font.Standard14Fonts
import org.apache.pdfbox.text.PDFTextStripper
import java.io.ByteArrayOutputStream
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class GapDocumentsTest {

    /** Einseitige A4-Vorlage mit einem erkennbaren Text, der nur aus dem Design stammt. */
    private fun templateBytes(): ByteArray {
        val doc = PDDocument()
        val page = PDPage(PDRectangle.A4)
        doc.addPage(page)
        val content = PDPageContentStream(doc, page)
        content.beginText()
        content.setFont(PDType1Font(Standard14Fonts.FontName.HELVETICA), 12f)
        content.newLineAtOffset(50f, 50f)
        content.showText("DESIGN")
        content.endText()
        content.close()

        val out = ByteArrayOutputStream()
        doc.save(out)
        doc.close()
        return out.toByteArray()
    }

    private fun addition(content: String, relTop: Double, fontSize: Float? = 20f) = AdditionalText(
        content = content,
        page = 1,
        relLeft = 0.0,
        relTop = relTop,
        relWidth = 1.0,
        relHeight = 0.05,
        textAlign = TextAlign.CENTER,
        fontSize = fontSize,
    )

    private fun text(doc: PDDocument, page: Int): String {
        val stripper = PDFTextStripper()
        stripper.startPage = page
        stripper.endPage = page
        return stripper.getText(doc)
    }

    @Test
    fun onePagePerCertificate() {
        val doc = gapDocuments(
            template = templateBytes(),
            font = null,
            withBackground = false,
            pages = listOf(
                listOf(addition("1. Platz", 0.45), addition("Carina Hein", 0.5)),
                listOf(addition("2. Platz", 0.45), addition("Malte Hein", 0.5)),
            ),
        )

        assertEquals(2, doc.numberOfPages)
        assertTrue(text(doc, 1).contains("Carina Hein"))
        assertTrue(text(doc, 2).contains("Malte Hein"))
        doc.close()
    }

    @Test
    fun withoutBackgroundTheDesignIsAbsent() {
        val doc = gapDocuments(
            template = templateBytes(),
            font = null,
            withBackground = false,
            pages = listOf(listOf(addition("1. Platz", 0.45))),
        )

        assertFalse(text(doc, 1).contains("DESIGN"))
        assertTrue(text(doc, 1).contains("1. Platz"))
        doc.close()
    }

    @Test
    fun withBackgroundTheDesignIsPresent() {
        val doc = gapDocuments(
            template = templateBytes(),
            font = null,
            withBackground = true,
            pages = listOf(listOf(addition("1. Platz", 0.45))),
        )

        val content = text(doc, 1)
        assertTrue(content.contains("DESIGN"))
        assertTrue(content.contains("1. Platz"))
        doc.close()
    }

    @Test
    fun pageFormatMatchesTheTemplate() {
        val doc = gapDocuments(
            template = templateBytes(),
            font = null,
            withBackground = false,
            pages = listOf(listOf(addition("1. Platz", 0.45))),
        )

        assertEquals(PDRectangle.A4.width, doc.getPage(0).mediaBox.width)
        assertEquals(PDRectangle.A4.height, doc.getPage(0).mediaBox.height)
        doc.close()
    }

    @Test
    fun multipleLinesAreRenderedSeparately() {
        val doc = gapDocuments(
            template = templateBytes(),
            font = null,
            withBackground = false,
            pages = listOf(listOf(addition("Carina Hein\nMalte Hein", 0.45))),
        )

        val lines = text(doc, 1).lines().filter { it.isNotBlank() }
        assertEquals(listOf("Carina Hein", "Malte Hein"), lines)
        doc.close()
    }

    @Test
    fun boldAndItalicDoNotBreakRendering() {
        val doc = gapDocuments(
            template = templateBytes(),
            font = null,
            withBackground = false,
            pages = listOf(
                listOf(
                    addition("1. Platz", 0.45).copy(bold = true),
                    addition("33:17,7 min", 0.55).copy(italic = true),
                )
            ),
        )

        val content = text(doc, 1)
        assertTrue(content.contains("1. Platz"))
        assertTrue(content.contains("33:17,7 min"))
        doc.close()
    }

    @Test
    fun existingSingleDocumentApiStillWorks() {
        // Rückwärtskompatibilität: die Teilnahmeurkunde nutzt weiterhin document(original, additions)
        // und erwartet das Design auf der Seite.
        val doc = document(
            original = templateBytes(),
            additions = listOf(addition("Max Mustermann", 0.45, fontSize = null)),
        )

        assertEquals(1, doc.numberOfPages)
        val content = text(doc, 1)
        assertTrue(content.contains("DESIGN"))
        assertTrue(content.contains("Max Mustermann"))
        doc.close()
    }
}
