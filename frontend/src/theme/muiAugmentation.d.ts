import '@mui/material/styles'
import type {} from '@mui/x-data-grid/themeAugmentation'

/** Lesbare Text-/Icon-Varianten der vier Aktionsfarben (≥ 4,5:1 gegen `background.paper`). */
type StatusText = {success: string; warning: string; error: string; info: string}

// Die Zusatzfarben setzt nur das Verwaltungs-Theme (AdminThemeScope). Außerhalb (Boards, Stream,
// Helfer-App) fehlen sie – deshalb optional. Für Code, der überall laufen soll, gibt es
// `statusTextColor`/`primaryTextColor` in theme/themeColors.ts mit Rückfall.
declare module '@mui/material/styles' {
    interface Palette {
        /** Arbeitsfläche hinter den Inhaltsflächen (etwas dunkler als `background.paper`). */
        canvas?: string
        /** Feiner Rahmen um Inhaltsflächen, Tabellen und Trenner. */
        border?: string
        /** Primärfarbe als lesbare Text-/Linkfarbe. */
        primaryText?: string
        statusText?: StatusText
    }

    interface PaletteOptions {
        canvas?: string
        border?: string
        primaryText?: string
        statusText?: StatusText
    }
}
