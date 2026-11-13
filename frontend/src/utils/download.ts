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
 * Lädt die Daten einer API-Antwort herunter. Der Dateiname kommt aus `Content-Disposition`,
 * sonst aus `fallbackName`. Ohne Daten passiert nichts (Rückgabe `false`).
 */
export const downloadResponse = (
    data: Blob | undefined,
    response: Response | undefined,
    fallbackName: string,
): boolean => {
    if (data === undefined) return false
    downloadBlob(data, (response && getFilename(response)) ?? fallbackName)
    return true
}

/**
 * Holt eine Datei per API-Aufruf und lädt sie herunter. Die Sperre (`setBusy`) fällt im `finally`
 * (siehe `runRequest`); Netzfehler kommen als `NetworkError` im Feld `error` zurück. Der
 * Download startet erst nach dem Zurücksetzen der Sperre, nur ohne Fehler und mit Daten.
 */
export const runDownload = async <E>(
    setBusy: ((busy: boolean) => void) | undefined,
    request: () => Promise<{data?: Blob; error?: E; response?: Response}>,
    fallbackName: string,
): Promise<{downloaded: boolean; error?: E | NetworkError}> => {
    const captured: {response?: Response} = {}
    const {data, error} = await runRequest(setBusy, async () => {
        const result = await request()
        captured.response = result.response
        return result
    })
    if (error !== undefined && error !== null) return {downloaded: false, error}
    return {downloaded: downloadResponse(data, captured.response, fallbackName)}
}
