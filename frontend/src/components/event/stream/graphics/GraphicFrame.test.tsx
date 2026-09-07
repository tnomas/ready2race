// @vitest-environment jsdom
import {act, render} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import GraphicFrame from './GraphicFrame.tsx'
import {GRAPHIC_TRANSITION_MS} from './graphicVisibility.ts'

describe('GraphicFrame', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(1_000_000)
    })
    afterEach(() => {
        vi.useRealTimers()
    })

    it('meldet das Erreichen von hidden, sobald die Ausblendanimation durch ist', () => {
        const onHidden = vi.fn()
        const {rerender, container} = render(
            <GraphicFrame visible onHidden={onHidden}>
                <span>Inhalt</span>
            </GraphicFrame>,
        )
        expect(container.textContent).toBe('Inhalt')
        expect(onHidden).not.toHaveBeenCalled()

        rerender(
            <GraphicFrame visible={false} onHidden={onHidden}>
                <span>Inhalt</span>
            </GraphicFrame>,
        )
        // Während des Ausblendens bleibt der Inhalt stehen …
        expect(container.textContent).toBe('Inhalt')
        expect(onHidden).not.toHaveBeenCalled()

        act(() => {
            vi.advanceTimersByTime(GRAPHIC_TRANSITION_MS + 20)
        })
        // … danach ist er weg und der Aufrufer weiß es.
        expect(container.textContent).toBe('')
        expect(onHidden).toHaveBeenCalledTimes(1)
    })
})
