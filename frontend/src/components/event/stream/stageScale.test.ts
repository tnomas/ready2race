import {describe, expect, it} from 'vitest'
import {stageScale, STREAM_STAGE_HEIGHT, STREAM_STAGE_WIDTH} from './stageScale'

describe('stageScale', () => {
    it('bleibt bei 1, wenn das Fenster exakt 1920×1080 misst', () => {
        expect(stageScale(STREAM_STAGE_WIDTH, STREAM_STAGE_HEIGHT)).toBe(1)
    })

    it('skaliert ein kleineres Landschaftsfenster auf die begrenzende Achse herunter', () => {
        // 960×540 ist exakt die Hälfte in beiden Achsen — beide ergäben denselben Faktor.
        expect(stageScale(960, 540)).toBe(0.5)
    })

    it('lässt bei einem ultra-breiten Fenster oben/unten Rand — die Höhe begrenzt', () => {
        // 3840×1080: doppelt so breit wie 16:9 verlangt, exakt normale Höhe.
        expect(stageScale(3840, 1080)).toBe(1)
    })

    it('lässt bei einem Hochformat-Fenster links/rechts Rand — die Breite begrenzt', () => {
        // 1080×1920 (Hochkant-Tablet): die Breite ist der Engpass.
        expect(stageScale(1080, 1920)).toBe(1080 / STREAM_STAGE_WIDTH)
    })

    it('liefert 1 für ein nicht messbares Fenster, statt durch Null zu teilen', () => {
        expect(stageScale(0, 1080)).toBe(1)
        expect(stageScale(1920, 0)).toBe(1)
        expect(stageScale(-1, -1)).toBe(1)
    })
})
