package de.lambda9.ready2race.backend.app.certificate

import de.lambda9.ready2race.backend.app.certificate.boundary.AwardCertificateService
import de.lambda9.ready2race.backend.app.certificate.boundary.CertificateService
import de.lambda9.ready2race.backend.app.certificate.entity.CertificateError
import de.lambda9.ready2race.backend.pdf.AdditionalText
import de.lambda9.ready2race.backend.text.TextAlign
import org.apache.pdfbox.Loader
import org.apache.pdfbox.pdmodel.PDDocument
import org.apache.pdfbox.pdmodel.PDPage
import org.apache.pdfbox.pdmodel.PDPageContentStream
import org.apache.pdfbox.pdmodel.common.PDRectangle
import org.apache.pdfbox.pdmodel.font.PDType1Font
import org.apache.pdfbox.pdmodel.font.Standard14Fonts
import org.apache.pdfbox.text.PDFTextStripper
import org.apache.poi.xwpf.usermodel.XWPFDocument
import de.lambda9.tailwind.core.Exit
import de.lambda9.tailwind.core.KIO.Companion.unsafeRunSync
import de.lambda9.tailwind.core.extensions.exit.getOrNull
import java.io.ByteArrayOutputStream
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import kotlin.test.fail

/**
 * `CertificateService.participantForEvent(additions, template, fontName, format)` ist rein
 * (Bytes rein, Bytes raus, keine Datenbank) und lässt sich deshalb ohne `testComprehension`
 * per `unsafeRunSync()` ausführen. Getestet wird hier ausschließlich die vierstellige
 * Überladung — die zweistellige (nur PDF, von E-Mail-Versand und Vorlagenvorschau genutzt)
 * ist bereits über [de.lambda9.ready2race.backend.pdf.GapDocumentsTest] mitabgedeckt.
 */
class CertificateServiceTest {

    /** Einseitige A4-Vorlage, wie sie eine echte Teilnahmeurkunden-Vorlage wäre. */
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

    private fun addition(content: String) = AdditionalText(
        content = content,
        page = 1,
        relLeft = 0.0,
        relTop = 0.45,
        relWidth = 1.0,
        relHeight = 0.05,
        textAlign = TextAlign.CENTER,
        fontSize = 20f,
    )

    private fun pdfText(bytes: ByteArray): String {
        val doc = Loader.loadPDF(bytes)
        val text = PDFTextStripper().getText(doc)
        doc.close()
        return text
    }

    @Test
    fun pdfBranchProducesAReopenablePdfWithTheExpectedText() {
        val exit = CertificateService.participantForEvent(
            additions = listOf(addition("Max Mustermann")),
            template = templateBytes(),
            fontName = null,
            format = AwardCertificateService.Format.PDF,
        ).unsafeRunSync()

        val bytes = exit.getOrNull()
        assertNotNull(bytes, "PDF-Zweig hätte Bytes liefern müssen")

        val text = pdfText(bytes)
        assertTrue(text.contains("DESIGN"), "Vorlagendesign muss enthalten sein")
        assertTrue(text.contains("Max Mustermann"))
    }

    @Test
    fun wordBranchProducesAReopenableDocumentWithTheExpectedText() {
        val exit = CertificateService.participantForEvent(
            additions = listOf(addition("Max Mustermann")),
            template = templateBytes(),
            fontName = "TheSansOffice",
            format = AwardCertificateService.Format.DOCX,
        ).unsafeRunSync()

        val bytes = exit.getOrNull()
        assertNotNull(bytes, "DOCX-Zweig hätte Bytes liefern müssen")

        val document = XWPFDocument(bytes.inputStream())
        assertTrue(document.paragraphs.any { it.text == "Max Mustermann" })
        document.close()
    }

    /**
     * Finding 1: Eine defekte Vorlage darf im Word-Zweig nicht als untypisierte Exception nach
     * oben durchschlagen, sondern muss als [CertificateError.UnreadableTemplate] ankommen — analog
     * zu `AwardCertificateError.UnreadableTemplate` beim Urkunden-Pendant.
     */
    @Test
    fun corruptTemplateOnTheWordPathFailsTypedInsteadOfThrowing() {
        val corruptTemplate = "das ist keine PDF-Datei".toByteArray()

        val exit = CertificateService.participantForEvent(
            additions = listOf(addition("Max Mustermann")),
            template = corruptTemplate,
            fontName = null,
            format = AwardCertificateService.Format.DOCX,
        ).unsafeRunSync()

        val error = when (exit) {
            is Exit.Failure -> exit.error.firstFailureOrNull()
                ?: fail("Fehler wurde nicht als typisierter Failure-Fall transportiert, sondern als Defect: ${exit.error.firstDefectOrNull()}")
            is Exit.Success -> fail("Defekte Vorlage hätte fehlschlagen müssen, lieferte aber Bytes")
        }

        assertEquals(CertificateError.UnreadableTemplate, error)
    }
}
