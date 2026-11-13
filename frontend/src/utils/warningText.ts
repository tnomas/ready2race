import {darken, Theme} from '@mui/material'

/**
 * Lesbarer Warn-Ton für TEXT auf hellem Grund.
 *
 * Die Warnfarbe der Theme-Palette ist ein Pastell-Hintergrundton (Standard-Theme `#f5d9b0`,
 * siehe ThemeProvider.DEFAULT_THEME) — gedacht für Chips und Flächen mit dunkler Schrift. Als
 * Textfarbe ist sie auf Weiß praktisch unsichtbar, und auch das von MUI abgeleitete
 * `warning.dark` bleibt unter 3:1 Kontrast.
 *
 * Hier deshalb exakt die Abdunklung, die MUIs `<Alert severity="warning">` selbst auf die
 * Palette anwendet (`darken(palette.warning.light, 0.6)`): kein erfundener Farbton, sondern
 * derselbe, in dem Warn-Alerts der App ihren Text setzen — Fließtext-Warnungen und Alerts
 * sehen damit zusammengehörig aus. Verwendung: `sx={{color: warningTextColor}}`.
 *
 * Innerhalb des Verwaltungs-Themes (AdminThemeScope) liefert die Funktion stattdessen die dort
 * abgeleitete Lesefarbe `palette.statusText.warning` (≥ 4,5:1 gegen die Inhaltsfläche), damit
 * alle Status-Texte der Verwaltung derselben Regel folgen. Außerhalb (Zeitnahme-Posten, Boards)
 * bleibt der bisherige Ton pixelgleich. Für neue Stellen: `statusTextColor(theme, 'warning')`
 * aus `theme/themeColors.ts`.
 */
export const warningTextColor = (theme: Theme): string =>
    theme.palette.statusText?.warning ?? darken(theme.palette.warning.light, 0.6)
