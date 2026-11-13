import {getFilename} from './helpers.ts'
import {runRequest} from './request.ts'
import type {NetworkError} from './hooks.ts'

/**
 * Datei-Downloads aus API-Antworten.
 *
 * Ersetzt das früher kopierte Muster (versteckter Anker mit `ref`, `href` setzen, `click()`,
 * `href` leeren), das die Blob-URL nie freigab: jede heruntergeladene PDF blieb bis zum
 * Schließen des Tabs im Speicher.
 */

/** Frist, nach der die Blob-URL freigegeben wird. Der Browser hat den Download dann übernommen. */
export const REVOKE_DELAY_MS = 10_000

/** Stößt den Download eines Blobs unter dem gegebenen Dateinamen an und gibt die URL später frei. */
export const downloadBlob = (blob: Blob, filename: string): void => {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    try {
        anchor.click()
    } finally {
        anchor.remove()
        setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS)
    }
}

/**
 * Macht aus den Daten einer API-Antwort einen Blob.
 *
 * Der API-Client liest `text/*` (z. B. `text/csv`) als **String**, nicht als Blob; ein leerer
 * Körper (204, `Content-Length: 0`) kommt als `{}` an. Strings und Binärpuffer werden mit dem
 * Inhaltstyp der Antwort verpackt, alles andere gilt als „keine Datei" (`undefined`).
 */
export const toDownloadBlob = (data: unknown, response: Response | undefined): Blob | undefined => {
    if (data instanceof Blob) return data
    const type = response?.headers.get('Content-Type') ?? ''
    if (typeof data === 'string') return new Blob([data], {type})
    if (data instanceof ArrayBuffer) {
        return data.byteLength > 0 ? new Blob([data], {type}) : undefined
    }
    return undefined
}

/**
 * Lädt die Daten einer API-Antwort herunter. Der Dateiname kommt aus `Content-Disposition`,
 * sonst aus `fallbackName`. Ohne verwertbare Daten passiert nichts (Rückgabe `false`).
 */
export const downloadResponse = (
    data: unknown,
    response: Response | undefined,
    fallbackName: string,
): boolean => {
    const blob = toDownloadBlob(data, response)
    if (blob === undefined) return false
    downloadBlob(blob, (response && getFilename(response)) ?? fallbackName)
    return true
}

/**
 * Lädt bereits geholte API-Daten unter festem Dateinamen herunter (Dokumente, deren Name nicht
 * aus der Antwort kommt). Wirft nie; `false` heißt „keine Datei erzeugt" und will eine Meldung.
 * Hochgeladene Dokumente können Text sein (`.txt`, `.csv`) und kommen dann als String an.
 */
export const downloadNamed = (data: unknown, filename: string): boolean => {
    try {
        return downloadResponse(data, undefined, filename)
    } catch (e) {
        console.error('Download fehlgeschlagen', e)
        return false
    }
}

/**
 * Holt eine Datei per API-Aufruf und lädt sie herunter. Die Sperre (`setBusy`) fällt im `finally`
 * (siehe `runRequest`); Netzfehler kommen als `NetworkError` im Feld `error` zurück. Der
 * Download startet erst nach dem Zurücksetzen der Sperre, nur ohne Fehler und mit Daten.
 *
 * Wirft nie: Scheitert das Erzeugen der Datei (leere Antwort, Browser verweigert die Blob-URL),
 * kommt `{downloaded: false}` ohne `error` zurück. Aufrufer melden diesen Fall selbst
 * (`!downloaded`), sonst endet er ohne Rückmeldung.
 */
export const runDownload = async <E>(
    setBusy: ((busy: boolean) => void) | undefined,
    request: () => Promise<{data?: unknown; error?: E; response?: Response}>,
    fallbackName: string,
): Promise<{downloaded: boolean; error?: E | NetworkError}> => {
    const captured: {response?: Response} = {}
    const {data, error} = await runRequest(setBusy, async () => {
        const result = await request()
        captured.response = result.response
        return result
    })
    if (error !== undefined && error !== null) return {downloaded: false, error}
    try {
        return {downloaded: downloadResponse(data, captured.response, fallbackName)}
    } catch (e) {
        console.error('Download fehlgeschlagen', e)
        return {downloaded: false}
    }
}
