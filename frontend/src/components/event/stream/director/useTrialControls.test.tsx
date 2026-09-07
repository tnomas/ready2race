// @vitest-environment jsdom
import {act, renderHook} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {useTrialControls} from './useTrialControls.ts'

const mocks = vi.hoisted(() => ({
    setStreamSceneTrialMode: vi.fn(),
    setStreamSceneTrialPhase: vi.fn(),
}))

vi.mock('@api/sdk.gen.ts', () => ({
    setStreamSceneTrialMode: mocks.setStreamSceneTrialMode,
    setStreamSceneTrialPhase: mocks.setStreamSceneTrialPhase,
}))

const setup = () => {
    const onChanged = vi.fn()
    const onError = vi.fn()
    const hook = renderHook(() => useTrialControls({eventId: 'event-1', sceneId: 'scene-1', onChanged, onError}))
    return {...hook, onChanged, onError}
}

describe('useTrialControls', () => {
    beforeEach(() => {
        mocks.setStreamSceneTrialMode.mockReset()
        mocks.setStreamSceneTrialPhase.mockReset()
    })

    it('meldet nach einem erfolgreichen Umschalten des Probemodus eine Änderung — der Stand ist nachzuladen', async () => {
        mocks.setStreamSceneTrialMode.mockResolvedValue({error: undefined})
        const {result, onChanged, onError} = setup()

        await act(() => result.current.toggleTrialMode(true))

        expect(mocks.setStreamSceneTrialMode).toHaveBeenCalledWith({
            path: {eventId: 'event-1', sceneId: 'scene-1'},
            query: {trialMode: true},
        })
        expect(onChanged).toHaveBeenCalledWith('trialMode')
        expect(onError).not.toHaveBeenCalled()
    })

    it('meldet nach einem erfolgreichen Phasenwechsel eine Änderung', async () => {
        mocks.setStreamSceneTrialPhase.mockResolvedValue({error: undefined})
        const {result, onChanged} = setup()

        await act(() => result.current.setTrialPhase('RESULT'))

        expect(mocks.setStreamSceneTrialPhase).toHaveBeenCalledWith({
            path: {eventId: 'event-1', sceneId: 'scene-1'},
            query: {phase: 'RESULT'},
        })
        expect(onChanged).toHaveBeenCalledWith('phase')
    })

    it('meldet einen Fehler und keine Änderung, wenn der Server ablehnt', async () => {
        mocks.setStreamSceneTrialMode.mockResolvedValue({error: {errorCode: 'X'}})
        const {result, onChanged, onError} = setup()

        await act(() => result.current.toggleTrialMode(false))

        expect(onChanged).not.toHaveBeenCalled()
        expect(onError).toHaveBeenCalledWith('trialMode')
    })

    it('ist während des Aufrufs beschäftigt und danach wieder frei', async () => {
        let resolve: (value: {error: undefined}) => void = () => {}
        mocks.setStreamSceneTrialPhase.mockReturnValue(new Promise(r => (resolve = r)))
        const {result} = setup()
        expect(result.current.busy).toBe(false)

        let pending: Promise<void> = Promise.resolve()
        act(() => {
            pending = result.current.setTrialPhase('IDLE')
        })
        expect(result.current.busy).toBe(true)

        await act(async () => {
            resolve({error: undefined})
            await pending
        })
        expect(result.current.busy).toBe(false)
    })
})
