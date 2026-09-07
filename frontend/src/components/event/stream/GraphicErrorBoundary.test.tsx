// @vitest-environment jsdom
import {render} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import GraphicErrorBoundary from './GraphicErrorBoundary.tsx'

const Bomb = ({explode}: {explode: boolean}) => {
    if (explode) throw new Error('kaputte Grafik')
    return <span>heil</span>
}

describe('GraphicErrorBoundary', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('lässt die Nachbarn stehen, wenn eine Grafik beim Rendern wirft', () => {
        const {container} = render(
            <>
                <GraphicErrorBoundary resetKey="a">
                    <Bomb explode />
                </GraphicErrorBoundary>
                <GraphicErrorBoundary resetKey="a">
                    <span>Nachbar</span>
                </GraphicErrorBoundary>
            </>,
        )
        expect(container.textContent).toBe('Nachbar')
    })

    it('meldet den Fehler in die Konsole statt ihn zu verschlucken', () => {
        render(
            <GraphicErrorBoundary resetKey="a">
                <Bomb explode />
            </GraphicErrorBoundary>,
        )
        const logged = vi
            .mocked(console.error)
            .mock.calls.some(call => call.some(arg => arg instanceof Error && arg.message === 'kaputte Grafik'))
        expect(logged).toBe(true)
    })

    it('versucht es mit dem nächsten Push (neuer resetKey) erneut', () => {
        const {container, rerender} = render(
            <GraphicErrorBoundary resetKey="push-1">
                <Bomb explode />
            </GraphicErrorBoundary>,
        )
        expect(container.textContent).toBe('')

        // Gleicher Push, anderer Inhalt: bleibt weg — sonst würde eine dauerhaft kaputte Grafik
        // bei jedem Render erneut werfen.
        rerender(
            <GraphicErrorBoundary resetKey="push-1">
                <Bomb explode={false} />
            </GraphicErrorBoundary>,
        )
        expect(container.textContent).toBe('')

        rerender(
            <GraphicErrorBoundary resetKey="push-2">
                <Bomb explode={false} />
            </GraphicErrorBoundary>,
        )
        expect(container.textContent).toBe('heil')
    })
})
