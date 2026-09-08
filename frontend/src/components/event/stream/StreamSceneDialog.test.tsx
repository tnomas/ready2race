// @vitest-environment jsdom
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import StreamSceneDialog from './StreamSceneDialog.tsx'

const mocks = vi.hoisted(() => ({
    createStreamScene: vi.fn(),
    updateStreamScene: vi.fn(),
    feedback: {success: vi.fn(), error: vi.fn(), warning: vi.fn()},
}))

vi.mock('react-i18next', () => ({useTranslation: () => ({t: (key: string) => key})}))
vi.mock('@utils/hooks', () => ({useFeedback: () => mocks.feedback}))
vi.mock('@api/sdk.gen', () => ({
    createStreamScene: mocks.createStreamScene,
    updateStreamScene: mocks.updateStreamScene,
}))

const safeAreaInput = () =>
    screen.getByLabelText('event.stream.scenes.safeAreaPercent') as HTMLInputElement

const renderDialog = () =>
    render(
        <StreamSceneDialog open onClose={() => {}} eventId="event-1" scene={null} onSaved={() => {}} />,
    )

describe('StreamSceneDialog: Sicherheitsabstand', () => {
    beforeEach(() => {
        mocks.createStreamScene.mockReset()
        mocks.createStreamScene.mockResolvedValue({data: {id: 'scene-1'}, error: undefined})
    })
    // Ohne Vitest-Globals räumt die Testing Library nicht von selbst auf — der Dialog rendert in
    // ein Portal am Dokument und bliebe sonst bis zum nächsten Test stehen.
    afterEach(cleanup)

    it('lässt das Feld beim Tippen in Ruhe und klemmt erst beim Verlassen', () => {
        renderDialog()
        const input = safeAreaInput()

        fireEvent.change(input, {target: {value: '250'}})
        expect(input.value).toBe('250')

        fireEvent.blur(input)
        expect(input.value).toBe('100')
    })

    it('markiert ein leeres Feld als ungültig und speichert nicht', async () => {
        renderDialog()
        fireEvent.change(screen.getByLabelText('event.stream.scenes.name'), {target: {value: 'Ziel'}})
        const input = safeAreaInput()
        fireEvent.change(input, {target: {value: ''}})
        fireEvent.blur(input)
        expect(input.value).toBe('')

        await act(async () => {
            fireEvent.click(screen.getByText('common.save'))
        })

        expect(mocks.createStreamScene).not.toHaveBeenCalled()
        expect(screen.getByText('event.stream.scenes.validation.safeAreaPercent')).toBeTruthy()
    })

    it('speichert den gerundeten Wert, auch wenn das Feld nie verlassen wurde', async () => {
        renderDialog()
        fireEvent.change(screen.getByLabelText('event.stream.scenes.name'), {target: {value: 'Ziel'}})
        fireEvent.change(safeAreaInput(), {target: {value: '7.6'}})

        await act(async () => {
            fireEvent.click(screen.getByText('common.save'))
        })

        expect(mocks.createStreamScene).toHaveBeenCalledTimes(1)
        expect(mocks.createStreamScene.mock.calls[0][0].body.safeAreaPercent).toBe(8)
    })
})
