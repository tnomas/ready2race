// @vitest-environment jsdom
import {act, renderHook} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {BoardViewDto} from '@api/types.gen'
import {useBoardViewData} from './useBoardViewData.ts'

const mocks = vi.hoisted(() => ({
    getBoardView: vi.fn(),
    onView: null as ((view: BoardViewDto) => void) | null,
}))

vi.mock('@api/sdk.gen', () => ({getBoardView: mocks.getBoardView}))
vi.mock('./useBoardViewSocket.ts', () => ({
    useBoardViewSocket: (eventId: string | null, _boardId: string, onView: (view: BoardViewDto) => void) => {
        mocks.onView = onView
        return {connected: eventId !== null}
    },
}))

const view = (serverTime: string, eventName: string): BoardViewDto => ({
    boardId: 'board-1',
    eventName,
    serverTime,
    refreshIntervalSeconds: 15,
    config: {columns: 1, tiles: [{elements: [{type: 'MATCH'}]}]},
    slots: [],
    lists: [],
})

/** Eine HTTP-Antwort, die der Test selbst zum gewünschten Zeitpunkt eintreffen lässt. */
const deferredResponse = () => {
    let resolve: (value: {data: BoardViewDto; response: Response}) => void = () => {}
    const promise = new Promise<{data: BoardViewDto; response: Response}>(r => {
        resolve = r
    })
    return {promise, resolve}
}

describe('useBoardViewData', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        mocks.getBoardView.mockReset()
        mocks.onView = null
    })
    afterEach(() => {
        vi.useRealTimers()
    })

    it('behält den Push, wenn eine verspätete HTTP-Antwort einen älteren Serverstand bringt', async () => {
        const first = deferredResponse()
        mocks.getBoardView.mockReturnValueOnce(first.promise)

        const {result, unmount} = renderHook(() => useBoardViewData('event-1', 'board-1'))

        // Der Kanal liefert einen frischen Stand, während der Erstabruf noch unterwegs ist.
        act(() => {
            mocks.onView?.(view('2026-08-14T10:00:10Z', 'gepusht'))
        })
        expect(result.current.data?.eventName).toBe('gepusht')

        // Die Antwort des Erstabrufs trudelt danach ein – sie wurde VOR dem Push berechnet.
        await act(async () => {
            first.resolve({
                data: view('2026-08-14T10:00:05Z', 'getaktet'),
                response: new Response(null, {status: 200}),
            })
            await Promise.resolve()
        })

        expect(result.current.data?.eventName).toBe('gepusht')
        unmount()
    })

    it('nimmt den getakteten Stand, wenn sein Serverstand jünger ist als der Push', async () => {
        const first = deferredResponse()
        mocks.getBoardView.mockReturnValueOnce(first.promise)

        const {result, unmount} = renderHook(() => useBoardViewData('event-1', 'board-1'))

        act(() => {
            mocks.onView?.(view('2026-08-14T10:00:05Z', 'gepusht'))
        })

        await act(async () => {
            first.resolve({
                data: view('2026-08-14T10:00:10Z', 'getaktet'),
                response: new Response(null, {status: 200}),
            })
            await Promise.resolve()
        })

        expect(result.current.data?.eventName).toBe('getaktet')
        unmount()
    })
})
