import {useTheme} from '@mui/material'
import {StreamGraphicSize} from '@api/types.gen'
import {solidOr} from '../../../board/streamOverlay/streamDisplay.ts'
// Die Schaubühnen-Schrift reist mit dem Bundle — der Server liefert sie aus, eine
// Wirecast-Quelle braucht keinen Internetzugang. Nur die beiden benutzten Schnitte.
import '@fontsource/barlow-condensed/600.css'
import '@fontsource/barlow-condensed/700.css'

/**
 * Bildsprache der Stream-Grafiken: eine tiefe, leicht durchscheinende „Wasser bei Dämmerung"-
 * Fläche statt reinem Schwarz, eine schmale, laufende Schaubühnen-Schrift für Titel, Labels
 * und Startnummern, die Fließtext-Schrift der App für Namen und Zeiten. Alle Maße in `em`,
 * damit die Größenvariante (`streamDensity`) eine ganze Grafik über EINE Wurzel-Schriftgröße
 * dichter setzt.
 */
export const STREAM_DISPLAY_FONT = "'Barlow Condensed', 'Roboto Condensed', 'Arial Narrow', sans-serif"

/** Schriftschnitte, die die Bühne vor der ersten Einblendung lädt (`document.fonts.load`). */
export const STREAM_PRELOAD_FONT_FACES = [
    "600 40px 'Barlow Condensed'",
    "700 40px 'Barlow Condensed'",
    '400 40px Roboto',
    '500 40px Roboto',
    '700 40px Roboto',
]

export const STREAM_PLATE = {
    background: 'linear-gradient(180deg, rgba(15, 30, 48, 0.92) 0%, rgba(7, 16, 27, 0.94) 100%)',
    /** Feine Lichtkante an der Oberkante — hebt die Fläche vom Kamerabild ab, ohne Rand. */
    hairline: 'rgba(255, 255, 255, 0.14)',
    stripe: 'rgba(255, 255, 255, 0.045)',
    divider: 'rgba(255, 255, 255, 0.10)',
    text: '#F5F7FA',
    muted: 'rgba(245, 247, 250, 0.68)',
    faint: 'rgba(245, 247, 250, 0.42)',
    /** Bojen-Orange: vorläufig, pausiert, Strafe — dieselbe Signalfarbe in allen Grafiken. */
    warning: '#F5B342',
    warningText: '#1A1207',
    shadow: '0 1.5em 3.75em rgba(0, 0, 0, 0.45)',
    radius: '0.45em',
} as const

/** Wurzel-Schriftgröße einer Grafik in rem — COMPACT setzt alles um ein Sechstel dichter. */
export const streamDensity = (size: StreamGraphicSize): number => (size === 'COMPACT' ? 0.84 : 1)

export interface StreamAccent {
    main: string
    contrastText: string
}

/** Akzentfarbe der Veranstaltung (Primärfarbe des Themes), immer deckend — siehe `solidOr`. */
export const useStreamAccent = (): StreamAccent => {
    const theme = useTheme()
    return {
        main: solidOr(theme.palette.primary.main, '#4d9f85'),
        contrastText: solidOr(theme.palette.primary.contrastText, '#ffffff'),
    }
}
