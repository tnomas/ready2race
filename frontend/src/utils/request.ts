import type {NetworkError} from './hooks.ts'

/**
 * Absende-Helfer für Schreibaufrufe (Speichern, Löschen, Aktionen).
 *
 * Der API-Client liefert Fachfehler als `{error}`, **wirft** aber bei Netzfehlern (Funkloch,
 * Backend weg, DNS). Das übliche Muster `setBusy(true); await call(); setBusy(false)` hinterließ
 * dann eine ewige Sperre und eine unbehandelte Rejection. `runRequest` setzt die Sperre im
 * `finally` zurück und übersetzt einen geworfenen Fehler in die Marke `NetworkError` (dieselbe wie
 * in `useFetch`), damit Aufrufer `t('common.error.network')` zeigen können.
 *
 * Ein bewusster Abbruch (`AbortError`, eigenes `AbortSignal`) wird weitergeworfen: Wer abbricht,
 * hat den Vorgang selbst beendet und erwartet kein Ergebnis.
 *
 * @example
 * const {error} = await runRequest(setSubmitting, () => deleteClub({path: {clubId}}))
 * if (isRequestNetworkError(error)) feedback.error(t('common.error.network'))
 * else if (error) feedback.error(t('entity.delete.error', {entity}))
 */
export type RequestOutcome<T, E> = {
    data?: T
    error?: E | NetworkError
}

export const networkError = (cause: unknown): NetworkError => ({kind: 'network', cause})

export const isRequestNetworkError = (error: unknown): error is NetworkError =>
    typeof error === 'object' &&
    error !== null &&
    'kind' in error &&
    (error as {kind: unknown}).kind === 'network'

const isAbortError = (e: unknown): boolean =>
    typeof e === 'object' && e !== null && 'name' in e && (e as {name: unknown}).name === 'AbortError'

export const runRequest = async <T, E>(
    setBusy: ((busy: boolean) => void) | undefined,
    request: () => Promise<{data?: T; error?: E}>,
): Promise<RequestOutcome<T, E>> => {
    setBusy?.(true)
    try {
        const {data, error} = await request()
        return {data, error}
    } catch (e) {
        if (isAbortError(e)) throw e
        return {error: networkError(e)}
    } finally {
        setBusy?.(false)
    }
}
