package de.lambda9.ready2race.backend.app.material.boundary

/**
 * Erkennt das Bildformat eines hochgeladenen Schadensfotos an den ersten Bytes (Signatur), nicht
 * am Dateinamen oder am mitgeschickten Inhaltstyp - beides bestimmt der Client. Erlaubt sind die
 * Rasterformate, die Handykameras und die Verkleinerung im Browser liefern; SVG (Skript im Bild)
 * und alles andere fällt durch.
 *
 * Reine Funktion ohne Zugriff auf Ktor oder die Datenbank, damit sie einzeln testbar ist.
 */
object MaterialPhotoType {

    /** Der erkannte Inhaltstyp, oder null, wenn die Bytes keines der erlaubten Formate sind. */
    fun detect(bytes: ByteArray): String? = when {
        bytes.startsWith(0xFF, 0xD8, 0xFF) -> "image/jpeg"
        bytes.startsWith(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A) -> "image/png"
        bytes.startsWith(0x47, 0x49, 0x46, 0x38) -> "image/gif"
        bytes.startsWith(0x52, 0x49, 0x46, 0x46) && bytes.hasAt(8, "WEBP") -> "image/webp"
        bytes.hasAt(4, "ftyp") && HEIF_BRANDS.any { bytes.hasAt(8, it) } -> "image/heic"
        else -> null
    }

    /**
     * Der Dateiname mit der Endung, die zum erkannten Typ passt. Die Auslieferung leitet den
     * Inhaltstyp aus dem Namen ab - ein Foto namens `x.svg` mit JPEG-Bytes ginge sonst als SVG
     * hinaus.
     */
    fun normalizedName(name: String, contentType: String): String {
        val base = name.substringAfterLast('/').substringAfterLast('\\').substringBeforeLast('.').ifBlank { "foto" }
        val extension = when (contentType) {
            "image/jpeg" -> "jpg"
            "image/png" -> "png"
            "image/gif" -> "gif"
            "image/webp" -> "webp"
            else -> "heic"
        }
        return "$base.$extension"
    }

    /** Markenkennungen der ISO-BMFF-Box `ftyp`, die HEIC/HEIF-Bilder tragen. */
    private val HEIF_BRANDS = listOf("heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1")

    private fun ByteArray.startsWith(vararg signature: Int): Boolean =
        size >= signature.size && signature.indices.all { this[it] == signature[it].toByte() }

    private fun ByteArray.hasAt(offset: Int, ascii: String): Boolean =
        size >= offset + ascii.length && ascii.indices.all { this[offset + it] == ascii[it].code.toByte() }
}
