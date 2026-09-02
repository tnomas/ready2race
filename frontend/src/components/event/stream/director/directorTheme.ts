import {createTheme, Theme} from '@mui/material'

/**
 * Das Regie-Board ist ein dunkler Arbeitsplatz wie ein Bildmischer: Die Grafiken auf den
 * Vorschauen sind für ein Kamerabild gemacht und lesen sich auf hellem Grund falsch, und ein
 * Regieplatz steht oft neben abgedunkelten Monitoren. Übernimmt die Akzentfarbe des
 * Veranstaltungs-Themes, damit „An" und „on air" dieselbe Farbe tragen wie die Grafiken selbst.
 */
export const DIRECTOR_COLORS = {
    background: '#0b111c',
    paper: '#141c2b',
    raised: '#1b2536',
    border: 'rgba(255, 255, 255, 0.08)',
    onAir: '#e53935',
    ready: '#4d9f85',
    off: '#78838f',
    noFeed: '#f5b342',
    /** Schachbrett hinter transparenten Vorschauen — so sieht man, wo die Bühne durchsichtig ist. */
    checker:
        'linear-gradient(45deg, #1f2937 25%, transparent 25%), linear-gradient(-45deg, #1f2937 25%, transparent 25%), ' +
        'linear-gradient(45deg, transparent 75%, #1f2937 75%), linear-gradient(-45deg, transparent 75%, #1f2937 75%)',
} as const

export const directorTheme = (base: Theme): Theme =>
    createTheme({
        ...base,
        palette: {
            mode: 'dark',
            primary: {main: base.palette.primary.main},
            background: {default: DIRECTOR_COLORS.background, paper: DIRECTOR_COLORS.paper},
            divider: DIRECTOR_COLORS.border,
        },
        components: {
            MuiButton: {defaultProps: {size: 'medium'}, styleOverrides: {root: {textTransform: 'none'}}},
            MuiToggleButton: {styleOverrides: {root: {textTransform: 'none'}}},
            MuiTab: {styleOverrides: {root: {textTransform: 'none'}}},
            MuiTextField: {defaultProps: {size: 'small'}},
        },
    })
