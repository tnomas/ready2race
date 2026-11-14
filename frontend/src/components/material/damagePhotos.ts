/**
 * Fotos für einen Schaden vorbereiten: nacheinander verkleinern und vorab aussortieren, was der
 * Server sicher abweist. Nacheinander, weil jedes dekodierte 12-MP-Handyfoto rund 48 MB belegt –
 * 15 Fotos gleichzeitig brachten den Tab am Telefon zum Absturz, und ein neuer Schaden war dann
 * samt Formular verloren. Grenzen wie im Backend: 10 MB je Datei, 50 MB je Anfrage, höchstens 20
 * Dateien – darüber weist der Server die ganze Anfrage ab, ohne etwas zu speichern.
 */
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024
export const PHOTOS_TOTAL_MAX_BYTES = 50 * 1024 * 1024
export const PHOTOS_PER_UPLOAD = 20

export type PhotoRejectReason =
    | 'notImage'
    | 'tooLarge'
    | 'tooMany'
    | 'totalTooLarge'
    | 'uploadFailed'
export type PhotoRejection = {name: string; reason: PhotoRejectReason}

export type PreparedPhotos = {accepted: File[]; rejected: PhotoRejection[]}

const looksLikeImage = (file: File) =>
    file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name)

export const preparePhotos = async (
    files: readonly File[],
    resize: (file: File) => Promise<File>,
    onProgress?: (done: number, total: number) => void,
): Promise<PreparedPhotos> => {
    const accepted: File[] = []
    const rejected: PhotoRejection[] = []
    let total = 0
    for (const [index, file] of files.entries()) {
        if (!looksLikeImage(file)) {
            rejected.push({name: file.name, reason: 'notImage'})
        } else if (accepted.length >= PHOTOS_PER_UPLOAD) {
            rejected.push({name: file.name, reason: 'tooMany'})
        } else {
            // Bewusst nacheinander: höchstens ein dekodiertes Bild zur Zeit im Speicher.
            const resized = await resize(file)
            if (resized.size > PHOTO_MAX_BYTES) {
                rejected.push({name: file.name, reason: 'tooLarge'})
            } else if (total + resized.size > PHOTOS_TOTAL_MAX_BYTES) {
                rejected.push({name: file.name, reason: 'totalTooLarge'})
            } else {
                total += resized.size
                accepted.push(resized)
            }
        }
        onProgress?.(index + 1, files.length)
    }
    return {accepted, rejected}
}

/**
 * Lädt die Fotos einzeln hoch: Ein Foto, das der Server ablehnt (z. B. eine Textdatei mit
 * Endung `.jpg`), nimmt die übrigen nicht mehr mit. Zurück kommen die abgelehnten Dateien mit
 * Grund; geworfene Fehler (Netz) zählen als „Hochladen fehlgeschlagen“.
 */
export const uploadPhotosOneByOne = async (
    files: readonly File[],
    upload: (file: File) => Promise<{error?: unknown}>,
): Promise<PhotoRejection[]> => {
    const rejected: PhotoRejection[] = []
    for (const file of files) {
        let error: unknown
        try {
            error = (await upload(file)).error
        } catch (e) {
            error = e ?? 'uploadFailed'
        }
        if (error !== undefined && error !== null) {
            rejected.push({name: file.name, reason: photoUploadRejectReason(error)})
        }
    }
    return rejected
}

const errorCodeOf = (error: unknown): unknown =>
    typeof error === 'object' && error !== null && 'errorCode' in error
        ? error.errorCode
        : undefined

/** Grund einer Server-Ablehnung, in denselben Worten wie das Aussortieren vorab. */
export const photoUploadRejectReason = (error: unknown): PhotoRejectReason => {
    switch (errorCodeOf(error)) {
        case 'MATERIAL_PHOTO_INVALID_TYPE':
            return 'notImage'
        case 'MATERIAL_PHOTO_TOO_LARGE':
            return 'tooLarge'
        default:
            return 'uploadFailed'
    }
}
