import {createContext, useContext} from 'react'
import {SpeakerColors, speakerColors} from './speakerData.ts'

export type SpeakerThemePreset = 'dark' | 'black' | 'light'

// the accent colors the user may override per device
export type SpeakerAccentKey = 'upcoming' | 'running' | 'finished' | 'now'

export type SpeakerSettings = {
    themePreset: SpeakerThemePreset
    // overall zoom of the board content in percent
    scalePercent: number
    // warn when a participant's next start is closer than this many minutes
    turnaroundMinutes: number
    customColors: Partial<Record<SpeakerAccentKey, string>>
    // the collapsible timeline strip above the dashboard columns
    showTimeline: boolean
    // center panel follows the currently live match instead of a manual pick
    followLive: boolean
    // program panel: keep finished matches in the list
    programShowFinished: boolean
    // program panel: single-line rows without team counts
    programCompact: boolean
    // match panel: show birth years next to participant names
    matchShowYears: boolean
    // timing panel: how many finish-line entries the ticker keeps visible
    timingTickerLimit: number
}

export const DEFAULT_SPEAKER_SETTINGS: SpeakerSettings = {
    themePreset: 'dark',
    scalePercent: 100,
    turnaroundMinutes: 45,
    customColors: {},
    showTimeline: false,
    followLive: true,
    programShowFinished: true,
    programCompact: false,
    matchShowYears: true,
    timingTickerLimit: 8,
}

const PRESET_PALETTES: Record<SpeakerThemePreset, SpeakerColors> = {
    dark: speakerColors,
    black: {
        ...speakerColors,
        background: '#000000',
        panel: '#0b1120',
        panelHover: '#16203a',
        border: '#1e293b',
    },
    light: {
        background: '#f1f5f9',
        panel: '#ffffff',
        panelHover: '#e2e8f0',
        border: '#cbd5e1',
        text: '#0f172a',
        textSecondary: '#475569',
        upcoming: '#2563eb',
        running: '#059669',
        finished: '#64748b',
        now: '#dc2626',
        gold: '#ca8a04',
    },
}

export const resolveSpeakerColors = (settings: SpeakerSettings): SpeakerColors => ({
    ...PRESET_PALETTES[settings.themePreset],
    ...Object.fromEntries(
        Object.entries(settings.customColors).filter(([, value]) => !!value),
    ),
})

const STORAGE_KEY = 'r2r-speaker-settings'

// Die Bereiche, die die Oberfläche anbietet (Regler und Auswahllisten) - gespeicherte Werte
// außerhalb davon werden hierher geklemmt, statt das Board zu verzerren.
const SCALE_RANGE = {min: 75, max: 150} as const
const TURNAROUND_RANGE = {min: 20, max: 90} as const
const TICKER_LIMIT_RANGE = {min: 5, max: 25} as const

const ACCENT_KEYS: readonly SpeakerAccentKey[] = ['upcoming', 'running', 'finished', 'now']
const HEX_COLOR = /^#[0-9a-f]{6}$/i

const clampNumber = (value: unknown, range: {min: number; max: number}, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value)
        ? Math.min(range.max, Math.max(range.min, value))
        : fallback

const asBoolean = (value: unknown, fallback: boolean): boolean =>
    typeof value === 'boolean' ? value : fallback

const isPreset = (value: unknown): value is SpeakerThemePreset =>
    typeof value === 'string' && Object.prototype.hasOwnProperty.call(PRESET_PALETTES, value)

const sanitizeColors = (value: unknown): Partial<Record<SpeakerAccentKey, string>> => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
    const record = value as Record<string, unknown>
    return Object.fromEntries(
        ACCENT_KEYS.filter(key => typeof record[key] === 'string' && HEX_COLOR.test(record[key] as string))
            .map(key => [key, record[key] as string]),
    )
}

/**
 * Macht aus dem, was in localStorage liegt, gültige Einstellungen - Feld für Feld, jedes mit
 * eigenem Rückfall auf die Vorgabe. Ein unbekannter Palettenname ergab bislang `undefined` als
 * Palette und ein Board ohne eine einzige Farbe; eine Skalierung von 900 % ein unbedienbares
 * Fenster. Beides kommt vor, sobald jemand den Speicher von Hand bearbeitet oder eine ältere
 * Fassung andere Werte geschrieben hat.
 */
export const sanitizeSpeakerSettings = (raw: unknown): SpeakerSettings => {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        return DEFAULT_SPEAKER_SETTINGS
    }
    const parsed = raw as Record<string, unknown>
    const defaults = DEFAULT_SPEAKER_SETTINGS
    return {
        themePreset: isPreset(parsed.themePreset) ? parsed.themePreset : defaults.themePreset,
        scalePercent: clampNumber(parsed.scalePercent, SCALE_RANGE, defaults.scalePercent),
        turnaroundMinutes: clampNumber(
            parsed.turnaroundMinutes,
            TURNAROUND_RANGE,
            defaults.turnaroundMinutes,
        ),
        customColors: sanitizeColors(parsed.customColors),
        showTimeline: asBoolean(parsed.showTimeline, defaults.showTimeline),
        followLive: asBoolean(parsed.followLive, defaults.followLive),
        programShowFinished: asBoolean(parsed.programShowFinished, defaults.programShowFinished),
        programCompact: asBoolean(parsed.programCompact, defaults.programCompact),
        matchShowYears: asBoolean(parsed.matchShowYears, defaults.matchShowYears),
        timingTickerLimit: clampNumber(
            parsed.timingTickerLimit,
            TICKER_LIMIT_RANGE,
            defaults.timingTickerLimit,
        ),
    }
}

export const loadSpeakerSettings = (): SpeakerSettings => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return DEFAULT_SPEAKER_SETTINGS
        return sanitizeSpeakerSettings(JSON.parse(raw))
    } catch {
        return DEFAULT_SPEAKER_SETTINGS
    }
}

export const saveSpeakerSettings = (settings: SpeakerSettings) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch {
        // storage may be unavailable (private mode) - settings then only last for the session
    }
}

type SpeakerSettingsContextValue = {
    settings: SpeakerSettings
    colors: SpeakerColors
    updateSettings: (update: Partial<SpeakerSettings>) => void
}

export const SpeakerSettingsContext = createContext<SpeakerSettingsContextValue>({
    settings: DEFAULT_SPEAKER_SETTINGS,
    colors: speakerColors,
    updateSettings: () => {},
})

export const useSpeakerSettings = () => useContext(SpeakerSettingsContext)

export const useSpeakerColors = (): SpeakerColors => useContext(SpeakerSettingsContext).colors
