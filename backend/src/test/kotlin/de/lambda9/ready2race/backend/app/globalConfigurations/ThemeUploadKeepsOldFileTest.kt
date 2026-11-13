package de.lambda9.ready2race.backend.app.globalConfigurations

import de.lambda9.ready2race.backend.app.globalConfigurations.boundary.ThemeService
import de.lambda9.ready2race.backend.app.globalConfigurations.entity.ThemeError
import de.lambda9.ready2race.backend.app.globalConfigurations.entity.UpdateThemeRequest
import de.lambda9.ready2race.backend.file.File
import de.lambda9.ready2race.testing.testComprehension
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Ein ungültiger Upload (falsche Endung) darf die bisherige Schrift bzw. das bisherige Logo nicht
 * löschen: theme.json zeigt weiter darauf, das Frontend lüde sonst eine fehlende Datei.
 * Arbeitet im `staticFilesPath` der Testkonfiguration (`teststatic`) und räumt danach auf.
 */
class ThemeUploadKeepsOldFileTest {

    private val root = java.io.File("teststatic")

    private fun <T> inCleanStaticDir(block: () -> T): T {
        val existedBefore = root.exists()
        try {
            return block()
        } finally {
            if (!existedBefore) root.deleteRecursively()
        }
    }

    @Test
    fun invalidFontUploadKeepsTheOldFont() = inCleanStaticDir {
        testComprehension {
            val request = UpdateThemeRequest.example.copy(enableCustomFont = true, enableCustomLogo = false)
            !ThemeService.updateTheme(request, File("alt.woff2", byteArrayOf(1, 2, 3)), null)
            assertTrue(java.io.File(root, "fonts/alt.woff2").exists())

            assertKIOFails(ThemeError.FontFileInvalid) {
                ThemeService.updateTheme(request, File("neu.exe", byteArrayOf(4)), null)
            }

            assertTrue(java.io.File(root, "fonts/alt.woff2").exists(), "die alte Schrift steht noch")
            assertFalse(java.io.File(root, "fonts/neu.exe").exists())
        }
    }

    @Test
    fun invalidLogoUploadKeepsTheOldLogo() = inCleanStaticDir {
        testComprehension {
            val request = UpdateThemeRequest.example.copy(enableCustomFont = false, enableCustomLogo = true)
            !ThemeService.updateTheme(request, null, File("alt.png", byteArrayOf(1, 2, 3)))
            assertTrue(java.io.File(root, "logos/alt.png").exists())

            assertKIOFails(ThemeError.LogoFileInvalid) {
                ThemeService.updateTheme(request, null, File("neu.txt", byteArrayOf(4)))
            }

            assertTrue(java.io.File(root, "logos/alt.png").exists(), "das alte Logo steht noch")
        }
    }

    @Test
    fun validReplacementRemovesTheOldFontAfterwards() = inCleanStaticDir {
        testComprehension {
            val request = UpdateThemeRequest.example.copy(enableCustomFont = true, enableCustomLogo = false)
            !ThemeService.updateTheme(request, File("alt.woff2", byteArrayOf(1)), null)
            !ThemeService.updateTheme(request, File("neu.woff2", byteArrayOf(2)), null)
            assertFalse(java.io.File(root, "fonts/alt.woff2").exists())
            assertTrue(java.io.File(root, "fonts/neu.woff2").exists())
            // Gleicher Name: die eben geschriebene Datei darf nicht als "alt" gelöscht werden.
            !ThemeService.updateTheme(request, File("neu.woff2", byteArrayOf(3)), null)
            assertTrue(java.io.File(root, "fonts/neu.woff2").exists())
        }
    }
}
