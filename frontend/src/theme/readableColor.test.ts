import {describe, expect, it} from 'vitest'
import {getContrastRatio} from '@mui/material/styles'
import {contrastTextOn, MIN_TEXT_CONTRAST, readableColor} from './readableColor.ts'

// Standardfarben des Mandanten-Themes (ThemeProvider.DEFAULT_THEME) – die Pastelltöne für
// Erfolg und Warnung lagen als Text bei rund 1,4:1.
const DEFAULT_COLORS = {
    primary: '#4d9f85',
    success: '#cbe694',
    warning: '#f5d9b0',
    error: '#da4d4d',
    info: '#6fb0d4',
}

describe('readableColor', () => {
    it('hebt alle Standardfarben auf Weiß über 4,5:1', () => {
        for (const color of Object.values(DEFAULT_COLORS)) {
            const result = readableColor(color, '#ffffff')
            expect(getContrastRatio(result, '#ffffff')).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST)
        }
    })

    it('lässt ausreichend dunkle Farben unverändert', () => {
        expect(readableColor('#000000', '#ffffff')).toBe('#000000')
        expect(readableColor('#1d1d1d', '#ffffff')).toBe('#1d1d1d')
    })

    it('dunkelt nur so weit ab wie nötig', () => {
        const result = readableColor(DEFAULT_COLORS.primary, '#ffffff')
        expect(result).not.toBe(DEFAULT_COLORS.primary)
        // deutlich heller als Schwarz: der Markenton bleibt erkennbar
        expect(getContrastRatio(result, '#ffffff')).toBeLessThan(7)
    })

    it('hellt auf dunklem Grund auf', () => {
        const result = readableColor('#203040', '#101010')
        expect(getContrastRatio(result, '#101010')).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST)
    })

    it('fällt bei unerreichbarem Ziel auf Schwarz oder Weiß zurück statt endlos zu laufen', () => {
        // 21:1 ist das physikalische Maximum (Schwarz auf Weiß); 30:1 ist unerreichbar.
        expect(readableColor('#808080', '#ffffff', 30)).toBe('#000000')
        expect(readableColor('#808080', '#000000', 30)).toBe('#ffffff')
    })

    it('respektiert eine abweichende Mindestschwelle', () => {
        const result = readableColor(DEFAULT_COLORS.primary, '#ffffff', 3)
        expect(result).toBe(DEFAULT_COLORS.primary)
    })
})

describe('contrastTextOn', () => {
    it('nimmt Weiß, wenn es reicht', () => {
        expect(contrastTextOn('#1d4f8f', '#1d1d1d')).toBe('#ffffff')
    })

    it('nimmt die dunkle Schrift auf zu hellen Flächen', () => {
        // Weiß auf dem Standard-Grün hat nur 3,18:1
        expect(contrastTextOn(DEFAULT_COLORS.primary, '#1d1d1d')).toBe('#1d1d1d')
        expect(contrastTextOn(DEFAULT_COLORS.warning, '#1d1d1d')).toBe('#1d1d1d')
    })
})
