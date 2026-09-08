// @vitest-environment jsdom
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {StreamSceneDto} from '@api/types.gen'
import StreamGraphicConfigDialog from './StreamGraphicConfigDialog.tsx'

const mocks = vi.hoisted(() => ({
    updateStreamSceneGraphics: vi.fn(),
    getDocuments: vi.fn(),
    feedback: {success: vi.fn(), error: vi.fn(), warning: vi.fn()},
}))

vi.mock('react-i18next', () => ({useTranslation: () => ({t: (key: string) => key})}))
vi.mock('@utils/hooks', () => ({
    useFeedback: () => mocks.feedback,
    useFetch: () => ({data: {data: []}, error: null, pending: false, reload: () => {}}),
}))
vi.mock('@api/sdk.gen', () => ({
    updateStreamSceneGraphics: mocks.updateStreamSceneGraphics,
    getDocuments: mocks.getDocuments,
}))

const scene = {
    id: 'scene-1',
    event: 'event-1',
    name: 'Ziel',
    background: 'TRANSPARENT',
    safeAreaPercent: 5,
    trialMode: false,
    trialPhase: 'IDLE',
    graphics: [
        {
            type: 'STARTLIST',
            enabled: true,
            placement: 'BOTTOM_CENTER',
            size: 'NORMAL',
            settings: {displaySeconds: 15, listLength: null, imageDocument: null},
        },
    ],
} as unknown as StreamSceneDto

/** Das Einblenddauer-Feld der Startliste — das einzige aktive Feld dieses Namens in der Szene oben. */
const displaySecondsInputs = () =>
    screen.getAllByLabelText('event.stream.scenes.graphicDialog.displaySeconds') as HTMLInputElement[]

const renderDialog = () =>
    render(<StreamGraphicConfigDialog open onClose={() => {}} eventId="event-1" scene={scene} onSaved={() => {}} />)

describe('StreamGraphicConfigDialog: Zahlenfelder', () => {
    beforeEach(() => {
        mocks.updateStreamSceneGraphics.mockReset()
        mocks.updateStreamSceneGraphics.mockResolvedValue({data: scene, error: undefined})
    })
    // Ohne Vitest-Globals räumt die Testing Library nicht von selbst auf — der Dialog rendert in
    // ein Portal am Dokument und bliebe sonst bis zum nächsten Test stehen.
    afterEach(cleanup)

    it('lässt das Feld beim Tippen in Ruhe und rundet erst beim Verlassen', () => {
        renderDialog()
        const input = displaySecondsInputs()[0]
        expect(input.value).toBe('15')

        fireEvent.change(input, {target: {value: '0.7'}})
        expect(input.value).toBe('0.7')

        fireEvent.blur(input)
        expect(input.value).toBe('1')
    })

    it('markiert ein leeres Feld als ungültig und speichert nicht', async () => {
        renderDialog()
        const input = displaySecondsInputs()[0]
        fireEvent.change(input, {target: {value: ''}})
        fireEvent.blur(input)
        expect(input.value).toBe('')
        expect(input.getAttribute('aria-invalid')).toBe('true')

        await act(async () => {
            fireEvent.click(screen.getByText('common.save'))
        })

        expect(mocks.updateStreamSceneGraphics).not.toHaveBeenCalled()
    })

    it('speichert den geklemmten Wert, auch wenn das Feld nie verlassen wurde', async () => {
        renderDialog()
        fireEvent.change(displaySecondsInputs()[0], {target: {value: '9999'}})

        await act(async () => {
            fireEvent.click(screen.getByText('common.save'))
        })

        expect(mocks.updateStreamSceneGraphics).toHaveBeenCalledTimes(1)
        const body = mocks.updateStreamSceneGraphics.mock.calls[0][0].body
        const startlist = body.graphics.find((g: {type: string}) => g.type === 'STARTLIST')
        expect(startlist.settings.displaySeconds).toBe(600)
    })
})
