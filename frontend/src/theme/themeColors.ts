import {Theme} from '@mui/material/styles'
import {readableColor} from './readableColor.ts'

export type StatusKey = 'success' | 'warning' | 'error' | 'info'

/**
 * Lesbare Text-/Icon-Farbe zu einer Aktionsfarbe, z. B. für ein Erfolgs-Häkchen oder einen
 * Warnhinweis als Fließtext: `sx={{color: theme => statusTextColor(theme, 'success')}}`.
 *
 * Innerhalb des Verwaltungs-Themes kommt der vorberechnete Wert aus `palette.statusText`; außerhalb
 * wird er hier aus der Mandantenfarbe abgeleitet – das Ergebnis ist in beiden Fällen dasselbe.
 */
export const statusTextColor = (theme: Theme, key: StatusKey): string =>
    theme.palette.statusText?.[key] ??
    readableColor(theme.palette[key].main, theme.palette.background.paper)

/** Primärfarbe als lesbare Text-/Linkfarbe (≥ 4,5:1 gegen `background.paper`). */
export const primaryTextColor = (theme: Theme): string =>
    theme.palette.primaryText ??
    readableColor(theme.palette.primary.main, theme.palette.background.paper)
