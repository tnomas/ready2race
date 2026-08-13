package de.lambda9.ready2race.backend.app.webDAV

import de.lambda9.ready2race.backend.app.webDAV.boundary.WebDAVService
import de.lambda9.ready2race.backend.config.Config
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Der Zielpfad hängt am Layout des Servers: Nextcloud/ownCloud legt die Dateien eines Nutzers unter
 * `remote.php/dav/files/<user>` ab, pCloud und die meisten schlichten WebDAV-Server direkt unter der
 * Wurzel. Das Layout war früher fest verdrahtet, deshalb prüfen die Fälle hier vor allem, dass die
 * bisherige Nextcloud-Form unverändert bleibt.
 */
class WebDAVServiceUrlTest {

    private fun config(
        layout: Config.WebDAV.Layout,
        path: String? = null,
        folderPath: String? = null,
    ) = Config.WebDAV(
        urlScheme = "https",
        host = "cloud.example.org",
        path = path,
        folderPath = folderPath,
        authUser = "regatta@example.org",
        authPassword = "geheim",
        layout = layout,
    )

    @Test
    fun `Nextcloud-Layout behaelt den remote-php-Pfad`() {
        assertEquals(
            "https://cloud.example.org/remote.php/dav/files/regatta@example.org/Export/Datei.pdf",
            WebDAVService.getUrl(config(Config.WebDAV.Layout.NEXTCLOUD), "Export/Datei.pdf"),
        )
    }

    @Test
    fun `Plain-Layout haengt die Datei direkt unter die Wurzel`() {
        assertEquals(
            "https://cloud.example.org/Export/Datei.pdf",
            WebDAVService.getUrl(config(Config.WebDAV.Layout.PLAIN), "Export/Datei.pdf"),
        )
    }

    @Test
    fun `Plain-Layout stellt den Zielordner voran`() {
        assertEquals(
            "https://cloud.example.org/Ready2Race/CRF-2026/Export/Datei.pdf",
            WebDAVService.getUrl(
                config(Config.WebDAV.Layout.PLAIN, folderPath = "/Ready2Race/CRF-2026"),
                "Export/Datei.pdf",
            ),
        )
    }

    @Test
    fun `Nextcloud-Layout stellt WEBDAV_PATH vor den remote-php-Pfad`() {
        assertEquals(
            "https://cloud.example.org/nextcloud/remote.php/dav/files/regatta@example.org/Datei.pdf",
            WebDAVService.getUrl(config(Config.WebDAV.Layout.NEXTCLOUD, path = "nextcloud"), "Datei.pdf"),
        )
    }

    @Test
    fun `Leerzeichen und Umlaute im Dateinamen werden kodiert`() {
        assertEquals(
            "https://cloud.example.org/Bahnenplan%20F%C3%B6rde.pdf",
            WebDAVService.getUrl(config(Config.WebDAV.Layout.PLAIN), "Bahnenplan Förde.pdf"),
        )
    }
}
