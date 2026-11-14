/**
 * Verkleinert Fotos im Browser, bevor sie hochgeladen werden - der Helfer-App-Upload für
 * Schadensfotos (Materialvermietung, Spec Abschnitt 10) soll keine 12-Megapixel-Handyfotos
 * gegen `MATERIAL_PHOTO_MAX_BYTES` werfen. Läuft komplett clientseitig, es gibt keinen
 * Server-Fallback - schlägt die Verkleinerung fehl, geht die Originaldatei durch und der
 * Server entscheidet über die Größe.
 */

/**
 * Zielgröße für eine Kante von höchstens `maxEdge` Pixeln, proportional und nie größer als
 * das Original. Reine Funktion ohne DOM-Zugriff - deshalb einzeln testbar.
 *
 * Rundet mit `Math.ceil` statt `Math.round`: die lange Kante trifft `maxEdge` exakt (das
 * Produkt kürzt sich rechnerisch heraus), die kurze Kante würde mit normalem Runden
 * regelmäßig ein Pixel zu klein geraten - lieber ein Pixel zu groß als das Seitenverhältnis
 * sichtbar zu verzerren.
 */
export const targetSize = (
    width: number,
    height: number,
    maxEdge: number,
): {width: number; height: number} => {
    const longEdge = Math.max(width, height)
    if (longEdge <= maxEdge) {
        return {width, height}
    }
    const shortEdge = Math.min(width, height)
    const short = Math.min(maxEdge, Math.max(1, Math.ceil((shortEdge * maxEdge) / longEdge)))
    return width > height ? {width: maxEdge, height: short} : {width: short, height: maxEdge}
}

/**
 * Verkleinert ein Bild auf höchstens `maxEdge` Pixel Kantenlänge und kodiert es als JPEG
 * (Qualität 0.85). Nicht-Bild-Dateien kommen unverändert zurück, ebenso wenn im Browser
 * irgendetwas schiefgeht (fehlendes `OffscreenCanvas`, ein defektes Bild, ...) - der Server
 * ist die verlässliche letzte Instanz, das hier ist nur eine Optimierung fürs Datenvolumen.
 */
export const resizeImage = async (file: File, maxEdge = 2000): Promise<File> => {
    if (!file.type.startsWith('image/')) {
        return file
    }

    let bitmap: ImageBitmap | null = null
    try {
        bitmap = await createImageBitmap(file)
        const {width, height} = targetSize(bitmap.width, bitmap.height, maxEdge)

        let blob: Blob | null
        if (typeof OffscreenCanvas !== 'undefined') {
            const canvas = new OffscreenCanvas(width, height)
            const ctx = canvas.getContext('2d')
            if (!ctx) {
                return file
            }
            ctx.drawImage(bitmap, 0, 0, width, height)
            blob = await canvas.convertToBlob({type: 'image/jpeg', quality: 0.85})
        } else {
            const canvas = document.createElement('canvas')
            canvas.width = width
            canvas.height = height
            const ctx = canvas.getContext('2d')
            if (!ctx) {
                return file
            }
            ctx.drawImage(bitmap, 0, 0, width, height)
            blob = await new Promise<Blob | null>(resolve =>
                canvas.toBlob(resolve, 'image/jpeg', 0.85),
            )
        }
        // Das dekodierte Bild sofort freigeben, nicht erst beim nächsten GC.
        bitmap.close()
        bitmap = null

        if (!blob) {
            return file
        }

        const name = file.name.replace(/\.[^./\\]+$/, '') + '.jpg'
        return new File([blob], name, {type: 'image/jpeg', lastModified: file.lastModified})
    } catch {
        return file
    } finally {
        bitmap?.close()
    }
}
