import {EventDocumentDto} from '@api/types.gen'

export type CourseImageDocumentsState =
    | {kind: 'loading'}
    | {kind: 'forbidden'}
    | {kind: 'error'}
    | {kind: 'empty'}
    | {kind: 'loaded'; documents: EventDocumentDto[]}

/**
 * Klassifiziert den `getDocuments`-Abruf für die COURSE_IMAGE-Bildwahl in genau die Fälle, die
 * der Konfigurationsdialog unterscheiden muss.
 *
 * `getDocuments` verlangt READ EVENT (siehe DocumentService/DocumentApi im Backend) - eine reine
 * Stream-Rolle (nur READ/UPDATE STREAM, genau die Zielgruppe, die dieser Verwaltungsbereich seit
 * Task 13 zulässt) bekommt dafür 403 zurück. Das darf NICHT wie eine leere Dokumentenliste
 * aussehen - sonst wirkt es, als gäbe es einfach keine Bilder, obwohl in Wahrheit das Recht fehlt.
 * Das Recht selbst zu erweitern ist bewusst NICHT Teil dieser Aufgabe (der Auslieferweg von
 * Streckenbildern an token-only Szenen ist ein eigener, bereits vorgemerkter Backend-Folgepunkt);
 * hier geht es nur darum, die Lücke in der Oberfläche sichtbar statt still zu machen.
 */
export const classifyCourseImageDocuments = (
    error: {status: number} | null,
    documents: {data: EventDocumentDto[]} | null,
): CourseImageDocumentsState => {
    if (error !== null) {
        return error.status === 403 ? {kind: 'forbidden'} : {kind: 'error'}
    }
    if (documents === null) {
        return {kind: 'loading'}
    }
    return documents.data.length === 0 ? {kind: 'empty'} : {kind: 'loaded', documents: documents.data}
}
