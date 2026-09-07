// @vitest-environment jsdom
import {act, render} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import GraphicFrame from './GraphicFrame.tsx'
import {GRAPHIC_TRANSITION_MS} from './graphicVisibility.ts'
import {StreamStaleContext} from '../StreamStaleContext.ts'

const NOW = Date.parse('2026-08-14T10:00:00Z')

describe('GraphicFrame', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(NOW)
    })
    afterEach(() => {
        vi.useRealTimers()
    })

    describe('Ablauf bei Verbindungsverlust', () => {
        const frame = (stale: boolean, visibleUntil: string | null, clockOffsetMs = 0) => (
            <StreamStaleContext.Provider value={stale}>
                <GraphicFrame visible visibleUntil={visibleUntil} clockOffsetMs={clockOffsetMs}>
                    <span>Inhalt</span>
                </GraphicFrame>
            </StreamStaleContext.Provider>
        )
        const past = new Date(NOW - 1_000).toISOString()
        const soon = new Date(NOW + 5_000).toISOString()

        it('blendet in der Störung aus, wenn das Anzeigefenster laut Server schon vorbei ist', () => {
            const {rerender, container} = render(frame(false, past))
            expect(container.textContent).toBe('Inhalt')

            rerender(frame(true, past))
            act(() => {
                vi.advanceTimersByTime(GRAPHIC_TRANSITION_MS + 20)
            })

            expect(container.textContent).toBe('')
        })

        it('lässt eine sichtbare Grafik ohne Störung stehen, auch wenn das Fenster vorbei ist', () => {
            const {container} = render(frame(false, past))
            act(() => {
                vi.advanceTimersByTime(GRAPHIC_TRANSITION_MS + 20)
            })
            expect(container.textContent).toBe('Inhalt')
        })

        it('blendet in der Störung erst aus, wenn das Fenster tatsächlich abläuft', () => {
            const {rerender, container} = render(frame(false, soon))
            rerender(frame(true, soon))

            act(() => {
                vi.advanceTimersByTime(4_000)
            })
            expect(container.textContent).toBe('Inhalt')

            // Fensterende erreicht: die Hülle beginnt auszublenden …
            act(() => {
                vi.advanceTimersByTime(1_000 + 20)
            })
            // … und ist nach der Animationsdauer weg.
            act(() => {
                vi.advanceTimersByTime(GRAPHIC_TRANSITION_MS + 20)
            })
            expect(container.textContent).toBe('')
        })

        it('rechnet mit dem Uhrversatz — ein vorgehendes Gerät blendet nicht zu früh aus', () => {
            // Gerät geht 10 s vor: das Fenster endet auf dem Gerät erst in 9 s.
            const {rerender, container} = render(frame(false, past, 10_000))
            rerender(frame(true, past, 10_000))
            act(() => {
                vi.advanceTimersByTime(GRAPHIC_TRANSITION_MS + 20)
            })
            expect(container.textContent).toBe('Inhalt')
        })

        it('lässt Grafiken ohne Anzeigefenster (Uhr, Ticker) in der Störung stehen', () => {
            const {rerender, container} = render(frame(false, null))
            rerender(frame(true, null))
            act(() => {
                vi.advanceTimersByTime(60_000)
            })
            expect(container.textContent).toBe('Inhalt')
        })
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
