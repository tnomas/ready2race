// @vitest-environment jsdom
import {act, renderHook} from '@testing-library/react'
import {createElement, PropsWithChildren} from 'react'
import {SnackbarProvider} from 'notistack'
import {RequestResult} from '@hey-api/client-fetch'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {useFeedback, useFetch} from './hooks.ts'

type Dto = {name: string}
type Err = {message: string}
type Settled = Awaited<RequestResult<Dto, Err, false>>

const ok = (name: string): Settled => ({
    data: {name},
    error: undefined,
    request: new Request('http://test/'),
    response: new Response(null, {status: 200}),
})

const failed = (status: number): Settled => ({
    data: undefined,
    error: {message: 'kaputt'},
    request: new Request('http://test/'),
    response: new Response(null, {status}),
})

/** Eine Antwort, die der Test selbst zum gewünschten Zeitpunkt eintreffen lässt. */
const deferred = () => {
    let resolve: (value: Settled) => void = () => {}
    let reject: (reason: unknown) => void = () => {}
    const promise = new Promise<Settled>((res, rej) => {
        resolve = res
        reject = rej
    }) as RequestResult<Dto, Err, false>
    return {promise, resolve, reject}
}

const setHidden = (hidden: boolean) => {
    Object.defineProperty(document, 'hidden', {configurable: true, get: () => hidden})
    Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => (hidden ? 'hidden' : 'visible'),
    })
    document.dispatchEvent(new Event('visibilitychange'))
}

/** Lässt ausstehende Mikrotasks (aufgelöste Promises) samt Zustandsänderungen durchlaufen. */
const flush = async () => {
    await act(async () => {
        await Promise.resolve()
    })
}

describe('useFetch', () => {
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => {
        unhandled.push(reason)
    }

    beforeEach(() => {
        unhandled.length = 0
        process.on('unhandledRejection', onUnhandled)
    })
    afterEach(() => {
        process.off('unhandledRejection', onUnhandled)
        vi.useRealTimers()
        setHidden(false)
    })

    it('liefert die Daten der Antwort', async () => {
        const req = vi.fn(() => Promise.resolve(ok('a')) as RequestResult<Dto, Err, false>)
        const {result} = renderHook(() => useFetch(req))
        await flush()
        expect(result.current.pending).toBe(false)
        expect(result.current.data).toEqual({name: 'a'})
        expect(result.current.error).toBeNull()
    })

    it('meldet einen HTTP-Fehler mit Status wie bisher', async () => {
        const req = vi.fn(() => Promise.resolve(failed(500)) as RequestResult<Dto, Err, false>)
        const {result} = renderHook(() => useFetch(req))
        await flush()
        expect(result.current.pending).toBe(false)
        expect(result.current.error?.status).toBe(500)
    })

    it('Netzfehler ohne onPanic: Fehlerzustand mit Status 0 statt ewigem pending', async () => {
        const req = vi.fn(
            () =>
                Promise.reject(new TypeError('Failed to fetch')) as RequestResult<Dto, Err, false>,
        )
        const {result} = renderHook(() => useFetch(req))
        await flush()
        await flush()
        expect(result.current.pending).toBe(false)
        expect(result.current.data).toBeNull()
        expect(result.current.error?.status).toBe(0)
        expect(unhandled).toEqual([])
    })

    it('Netzfehler nach einem guten Stand: der Stand bleibt stehen, pending endet', async () => {
        const second = deferred()
        const req = vi
            .fn<() => RequestResult<Dto, Err, false>>()
            .mockReturnValueOnce(Promise.resolve(ok('a')) as RequestResult<Dto, Err, false>)
            .mockReturnValueOnce(second.promise)
        const {result} = renderHook(() => useFetch(req))
        await flush()
        expect(result.current.data).toEqual({name: 'a'})

        act(() => result.current.reload())
        expect(result.current.pending).toBe(true)
        await act(async () => {
            second.reject(new TypeError('Failed to fetch'))
            await second.promise.catch(() => {})
        })
        await flush()
        expect(result.current.pending).toBe(false)
        expect(result.current.data).toEqual({name: 'a'})
        expect(unhandled).toEqual([])
    })

    it('Netzfehler mit onPanic: Rückruf statt Fehlerzustand, pending endet trotzdem', async () => {
        const onPanic = vi.fn()
        const req = vi.fn(
            () =>
                Promise.reject(new TypeError('Failed to fetch')) as RequestResult<Dto, Err, false>,
        )
        const {result} = renderHook(() => useFetch(req, {onPanic}))
        await flush()
        await flush()
        expect(onPanic).toHaveBeenCalledTimes(1)
        expect(result.current.pending).toBe(false)
        expect(result.current.error).toBeNull()
    })

    it('bei schnellem Parameterwechsel landet nur die Antwort des letzten Parameters', async () => {
        const first = deferred()
        const second = deferred()
        const onResponse = vi.fn()
        const req = vi
            .fn<(signal: AbortSignal) => RequestResult<Dto, Err, false>>()
            .mockReturnValueOnce(first.promise)
            .mockReturnValueOnce(second.promise)
        const {result, rerender} = renderHook(
            ({id}: {id: string}) => useFetch(req, {deps: [id], onResponse}),
            {initialProps: {id: 'a'}},
        )
        rerender({id: 'b'})

        // Die neuere Antwort kommt zuerst, die ältere hinterher (sie ignoriert den Abbruch).
        await act(async () => {
            second.resolve(ok('b'))
            await second.promise
        })
        await act(async () => {
            first.resolve(ok('a'))
            await first.promise
        })
        await flush()

        expect(result.current.data).toEqual({name: 'b'})
        expect(onResponse).toHaveBeenCalledTimes(1)
    })

    it('preCondition false leert den vorigen Stand', async () => {
        const req = vi.fn(() => Promise.resolve(ok('a')) as RequestResult<Dto, Err, false>)
        const {result, rerender} = renderHook(
            ({enabled}: {enabled: boolean}) =>
                useFetch(req, {preCondition: () => enabled, deps: [enabled]}),
            {initialProps: {enabled: true}},
        )
        await flush()
        expect(result.current.data).toEqual({name: 'a'})

        rerender({enabled: false})
        expect(result.current.data).toBeNull()
        expect(result.current.pending).toBe(false)
    })

    it('autoReloadInterval pausiert im verdeckten Tab und lädt beim Zurückkehren sofort', async () => {
        vi.useFakeTimers()
        const req = vi.fn(() => Promise.resolve(ok('a')) as RequestResult<Dto, Err, false>)
        renderHook(() => useFetch(req, {autoReloadInterval: 1000}))
        await flush()
        expect(req).toHaveBeenCalledTimes(1)

        await act(async () => {
            await vi.advanceTimersByTimeAsync(1000)
        })
        expect(req).toHaveBeenCalledTimes(2)

        act(() => setHidden(true))
        await act(async () => {
            await vi.advanceTimersByTimeAsync(5000)
        })
        expect(req).toHaveBeenCalledTimes(2)

        act(() => setHidden(false))
        await flush()
        expect(req).toHaveBeenCalledTimes(3)
    })

    it('ohne autoReloadInterval lädt die Rückkehr in den Tab nichts nach', async () => {
        const req = vi.fn(() => Promise.resolve(ok('a')) as RequestResult<Dto, Err, false>)
        renderHook(() => useFetch(req))
        await flush()
        act(() => setHidden(true))
        act(() => setHidden(false))
        await flush()
        expect(req).toHaveBeenCalledTimes(1)
    })
})

describe('useFeedback', () => {
    it('liefert über Renderdurchläufe dasselbe Objekt', () => {
        const wrapper = ({children}: PropsWithChildren) =>
            createElement(SnackbarProvider, null, children)
        const {result, rerender} = renderHook(() => useFeedback(), {wrapper})
        const first = result.current
        rerender()
        expect(result.current).toBe(first)
        expect(result.current.error).toBe(first.error)
    })
})
