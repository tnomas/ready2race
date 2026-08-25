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
 */
export const warningTextColor = (theme: Theme): string => darken(theme.palette.warning.light, 0.6)
