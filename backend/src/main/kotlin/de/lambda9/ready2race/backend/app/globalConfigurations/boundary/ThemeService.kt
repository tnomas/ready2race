package de.lambda9.ready2race.backend.app.globalConfigurations.boundary

import com.fasterxml.jackson.module.kotlin.readValue
import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.globalConfigurations.entity.ThemeConfigDto
import de.lambda9.ready2race.backend.app.globalConfigurations.entity.ThemeError
import de.lambda9.ready2race.backend.app.globalConfigurations.entity.UpdateThemeRequest
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.calls.serialization.jsonMapper
import de.lambda9.ready2race.backend.kio.accessConfig
import de.lambda9.tailwind.core.KIO
import java.io.File

object ThemeService {

    private const val MAX_FONT_SIZE_BYTES = 5 * 1024 * 1024 // 5MB
    private val ALLOWED_FONT_EXTENSIONS = setOf("woff", "woff2")
    private const val MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024 // 2MB
    private val ALLOWED_LOGO_EXTENSIONS = setOf("png", "jpg", "jpeg", "svg", "webp")

    fun updateTheme(
        request: UpdateThemeRequest,
        uploadedFontFile: de.lambda9.ready2race.backend.file.File?,
        uploadedLogoFile: de.lambda9.ready2race.backend.file.File?
    ): App<ThemeError, ApiResponse.NoData> = KIO.comprehension {
        val config = !accessConfig()

        val themeFile = File(config.staticFilesPath, "theme.json")
        val currentTheme = if (themeFile.exists()) {
            !KIO.effect {
                jsonMapper.readValue<ThemeConfigDto>(themeFile)
            }.mapError { ThemeError.ThemeFileMalformed }
        } else null

        // Erst beide Uploads prüfen, dann schreiben, dann theme.json, ZULETZT die alten Dateien
        // löschen. Früher wurde die alte Datei vor der Prüfung gelöscht: eine ungültige neue Datei
        // (Endung, Größe) ließ den Aufruf scheitern, die alte war aber schon weg und theme.json
        // zeigte weiter auf sie. Dateisystem-Schritte kennen keinen Rollback.
        if (uploadedFontFile != null && request.enableCustomFont) {
            val extension = uploadedFontFile.name.substringAfterLast('.', "").lowercase()
            !KIO.failOn(extension !in ALLOWED_FONT_EXTENSIONS) { ThemeError.FontFileInvalid }
            !KIO.failOn(uploadedFontFile.bytes.size > MAX_FONT_SIZE_BYTES) { ThemeError.FontFileTooLarge }
        }
        if (uploadedLogoFile != null && request.enableCustomLogo) {
            val extension = uploadedLogoFile.name.substringAfterLast('.', "").lowercase()
            !KIO.failOn(extension !in ALLOWED_LOGO_EXTENSIONS) { ThemeError.LogoFileInvalid }
            !KIO.failOn(uploadedLogoFile.bytes.size > MAX_LOGO_SIZE_BYTES) { ThemeError.LogoFileTooLarge }
        }
        val obsoleteFonts = mutableListOf<String>()
        val obsoleteLogos = mutableListOf<String>()

        // Handle font file upload
        val newCustomFont = when {
            uploadedFontFile != null && request.enableCustomFont -> {
                val fontsDir = File(config.staticFilesPath, "fonts")
                fontsDir.mkdirs()

                val sanitizedFilename = uploadedFontFile.name.replace(Regex("[^a-zA-Z0-9._-]"), "_")
                val fontFile = File(fontsDir, sanitizedFilename)
                fontFile.writeBytes(uploadedFontFile.bytes)
                currentTheme?.customFont?.filename
                    ?.takeIf { it != sanitizedFilename }
                    ?.let { obsoleteFonts += it }

                ThemeConfigDto.CustomFontDto(enabled = true, filename = sanitizedFilename)
            }

            request.enableCustomFont && currentTheme?.customFont?.filename != null -> {
                // Keep existing font
                currentTheme.customFont
            }

            !request.enableCustomFont -> {
                // Delete font if disabling (nach dem Schreiben von theme.json)
                currentTheme?.customFont?.filename?.let { obsoleteFonts += it }
                ThemeConfigDto.CustomFontDto.default
            }

            else -> ThemeConfigDto.CustomFontDto.default
        }

        // Handle logo file upload
        val newCustomLogo = when {
            uploadedLogoFile != null && request.enableCustomLogo -> {
                val logosDir = File(config.staticFilesPath, "logos")
                logosDir.mkdirs()

                val sanitizedFilename = uploadedLogoFile.name.replace(Regex("[^a-zA-Z0-9._-]"), "_")
                val logoFile = File(logosDir, sanitizedFilename)
                logoFile.writeBytes(uploadedLogoFile.bytes)
                currentTheme?.customLogo?.filename
                    ?.takeIf { it != sanitizedFilename }
                    ?.let { obsoleteLogos += it }

                ThemeConfigDto.CustomLogoDto(enabled = true, filename = sanitizedFilename)
            }

            request.enableCustomLogo && currentTheme?.customLogo?.filename != null -> {
                // Keep existing logo
                currentTheme.customLogo
            }

            !request.enableCustomLogo -> {
                // Delete logo if disabling (nach dem Schreiben von theme.json)
                currentTheme?.customLogo?.filename?.let { obsoleteLogos += it }
                ThemeConfigDto.CustomLogoDto.default
            }

            else -> ThemeConfigDto.CustomLogoDto.default
        }

        // Update theme
        val updatedTheme = ThemeConfigDto(
            primary = ThemeConfigDto.PrimaryColors(
                main = request.primary.main,
                light = request.primary.light
            ),
            textColor = ThemeConfigDto.TextColors(
                primary = request.textColor.primary,
                secondary = request.textColor.secondary
            ),
            actionColors = ThemeConfigDto.ActionColors(
                success = request.actionColors.success,
                warning = request.actionColors.warning,
                error = request.actionColors.error,
                info = request.actionColors.info
            ),
            backgroundColor = request.backgroundColor,
            customFont = newCustomFont,
            customLogo = newCustomLogo
        )

        !updateTheme(config.staticFilesPath, updatedTheme)

        obsoleteFonts.forEach { !deleteFontFile(config.staticFilesPath, it) }
        obsoleteLogos.forEach { !deleteLogoFile(config.staticFilesPath, it) }

        ApiResponse.noData
    }

    fun resetTheme(): App<ThemeError, ApiResponse.NoData> = KIO.comprehension {
        val config = !accessConfig()

        // Delete theme.json
        val themeFile = File(config.staticFilesPath, "theme.json")
        if (themeFile.exists()) {
            themeFile.delete()
        }

        // Delete all font files
        val fontsDir = File(config.staticFilesPath, "fonts")
        if (fontsDir.exists() && fontsDir.isDirectory) {
            fontsDir.listFiles()?.forEach { it.delete() }
        }

        // Delete all logo files
        val logosDir = File(config.staticFilesPath, "logos")
        if (logosDir.exists() && logosDir.isDirectory) {
            logosDir.listFiles()?.forEach { it.delete() }
        }

        // Write default theme
        !updateTheme(config.staticFilesPath, ThemeConfigDto.default)

        ApiResponse.noData
    }

    private fun deleteFontFile(staticFilesPath: String, filename: String): App<Nothing, Unit> = KIO.comprehension {
        val fontsFolder = File(staticFilesPath, "fonts")
        if (fontsFolder.exists()) {
            val fontFile = File(fontsFolder, filename)
            if (fontFile.exists()) {
                fontFile.delete()
            }
        }
        KIO.unit
    }

    private fun deleteLogoFile(staticFilesPath: String, filename: String): App<Nothing, Unit> = KIO.comprehension {
        val logosFolder = File(staticFilesPath, "logos")
        if (logosFolder.exists()) {
            val logoFile = File(logosFolder, filename)
            if (logoFile.exists()) {
                logoFile.delete()
            }
        }
        KIO.unit
    }


    private fun updateTheme(staticFilesPath: String, theme: ThemeConfigDto): App<ThemeError, Unit> =
        KIO.comprehension {
            val themeFile = File(staticFilesPath, "theme.json")

            themeFile.parentFile?.mkdirs()
            jsonMapper.writerWithDefaultPrettyPrinter().writeValue(themeFile, theme)

            KIO.unit
        }
}
