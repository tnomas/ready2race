// @vitest-environment jsdom
import {act, renderHook} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {usePolledEndpoint} from './usePolledEndpoint.ts'

vi.mock('@utils/eventChange/useEventChangeSocket.ts', () => ({
    useEventChangeSocket: () => ({connected: false}),
}))

type Dto = {id: string}
type Loaded = {data?: Dto; response: Response}

const deferred = () => {
    let resolve: (value: Loaded) => void = () => {}
    const promise = new Promise<Loaded>(r => {
        resolve = r
    })
    return {promise, resolve}
}

const loaded = (id: string): Loaded => ({data: {id}, response: new Response(null, {status: 200})})
const status = (code: number): Loaded => ({response: new Response(null, {status: code})})

describe('usePolledEndpoint', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })
    afterEach(() => {
        vi.useRealTimers()
    })

    it('ein Zielwechsel räumt Daten und Meldungen des vorigen Ziels sofort ab', async () => {
        const nextLoad = deferred()
        const load = vi
            .fn<(target: string) => Promise<Loaded>>()
            .mockResolvedValueOnce(status(404))
            .mockReturnValueOnce(nextLoad.promise)
        const {result, rerender} = renderHook(
            ({target}: {target: string}) =>
                usePolledEndpoint<Dto>(
                    () => load(target),
                    () => 15,
                    [target],
                ),
            {initialProps: {target: 'a'}},
        )
        await act(async () => {
            await Promise.resolve()
        })
        expect(result.current.notFound).toBe(true)
        expect(result.current.initialLoad).toBe(false)

        rerender({target: 'b'})
        expect(result.current.notFound).toBe(false)
        expect(result.current.initialLoad).toBe(true)
        expect(result.current.data).toBeNull()

        await act(async () => {
            nextLoad.resolve(loaded('b'))
            await nextLoad.promise
        })
        expect(result.current.data).toEqual({id: 'b'})
    })

    it('ein Zielwechsel zeigt nicht die Daten des vorigen Ziels', async () => {
        const nextLoad = deferred()
        const load = vi
            .fn<(target: string) => Promise<Loaded>>()
            .mockResolvedValueOnce(loaded('a'))
            .mockReturnValueOnce(nextLoad.promise)
        const {result, rerender} = renderHook(
            ({target}: {target: string}) =>
                usePolledEndpoint<Dto>(
                    () => load(target),
                    () => 15,
                    [target],
                ),
            {initialProps: {target: 'a'}},
        )
        await act(async () => {
            await Promise.resolve()
        })
        expect(result.current.data).toEqual({id: 'a'})
        expect(result.current.lastUpdated).not.toBeNull()

        rerender({target: 'b'})
        expect(result.current.data).toBeNull()
        expect(result.current.lastUpdated).toBeNull()
        expect(result.current.loadFailed).toBe(false)
    })

    it('eine verspätete Antwort des vorigen Ziels überschreibt das neue nicht', async () => {
        const oldLoad = deferred()
        const newLoad = deferred()
        const load = vi
            .fn<(target: string) => Promise<Loaded>>()
            .mockReturnValueOnce(oldLoad.promise)
            .mockReturnValueOnce(newLoad.promise)
        const {result, rerender} = renderHook(
            ({target}: {target: string}) =>
                usePolledEndpoint<Dto>(
                    () => load(target),
                    () => 15,
                    [target],
                ),
            {initialProps: {target: 'a'}},
        )
        rerender({target: 'b'})

        await act(async () => {
            newLoad.resolve(loaded('b'))
            await newLoad.promise
        })
        // Die alte Antwort ignoriert den Abbruch und kommt trotzdem noch an.
        await act(async () => {
            oldLoad.resolve(loaded('a'))
            await oldLoad.promise
        })
        expect(result.current.data).toEqual({id: 'b'})
    })
})
