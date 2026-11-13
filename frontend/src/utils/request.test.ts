import {describe, expect, it, vi} from 'vitest'
import {isRequestNetworkError, runRequest} from './request.ts'

describe('runRequest', () => {
    it('liefert Daten und löst die Sperre', async () => {
        const busy = vi.fn()
        const result = await runRequest(busy, async () => ({data: 42}))
        expect(result).toEqual({data: 42, error: undefined})
        expect(busy.mock.calls).toEqual([[true], [false]])
    })

    it('reicht Fachfehler unverändert durch', async () => {
        const busy = vi.fn()
        const result = await runRequest<void, {status: number}>(busy, async () => ({
            error: {status: 409},
        }))
        expect(result.error).toEqual({status: 409})
        expect(isRequestNetworkError(result.error)).toBe(false)
        expect(busy).toHaveBeenLastCalledWith(false)
    })

    it('macht aus einem geworfenen Fehler einen Netzfehler und löst die Sperre', async () => {
        const busy = vi.fn()
        const cause = new TypeError('Failed to fetch')
        const result = await runRequest(busy, () => Promise.reject(cause))
        expect(isRequestNetworkError(result.error)).toBe(true)
        expect(result.error).toEqual({kind: 'network', cause})
        expect(busy.mock.calls).toEqual([[true], [false]])
    })

    it('fängt auch synchron geworfene Fehler', async () => {
        const result = await runRequest(undefined, () => {
            throw new Error('kaputt')
        })
        expect(isRequestNetworkError(result.error)).toBe(true)
    })

    it('wirft einen bewussten Abbruch weiter, löst aber die Sperre', async () => {
        const busy = vi.fn()
        const abort = new DOMException('aborted', 'AbortError')
        await expect(runRequest(busy, () => Promise.reject(abort))).rejects.toBe(abort)
        expect(busy).toHaveBeenLastCalledWith(false)
    })
})

describe('isRequestNetworkError', () => {
    it('erkennt nur die Netzfehler-Marke', () => {
        expect(isRequestNetworkError({kind: 'network', cause: null})).toBe(true)
        expect(isRequestNetworkError({kind: 'other'})).toBe(false)
        expect(isRequestNetworkError(undefined)).toBe(false)
        expect(isRequestNetworkError('network')).toBe(false)
    })
})
