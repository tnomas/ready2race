/**
 * Fotos für einen Schaden vorbereiten: nacheinander verkleinern und vorab aussortieren, was der
 * Server sicher abweist. Nacheinander, weil jedes dekodierte 12-MP-Handyfoto rund 48 MB belegt –
 * 15 Fotos gleichzeitig brachten den Tab am Telefon zum Absturz, und ein neuer Schaden war dann
 * samt Formular verloren. Grenzen wie im Backend (`MATERIAL_PHOTO_MAX_BYTES`,
 * `MATERIAL_PHOTOS_PER_UPLOAD`).
 */
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024
export const PHOTOS_PER_UPLOAD = 20

export type PhotoRejectReason = 'notImage' | 'tooLarge' | 'tooMany'
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
            } else {
                accepted.push(resized)
            }
        }
        onProgress?.(index + 1, files.length)
    }
    return {accepted, rejected}
}
