import {createContext, useContext} from 'react'
import {SpeakerColors, speakerColors} from './speakerData.ts'

export type SpeakerThemePreset = 'dark' | 'black' | 'light'

// the accent colors the user may override per device
export type SpeakerAccentKey = 'upcoming' | 'running' | 'finished' | 'now'

export type SpeakerSettings = {
    themePreset: SpeakerThemePreset
    // overall zoom of the board content in percent
    scalePercent: number
    // polling interval for the live data in seconds
    refreshSeconds: number
    // warn when a participant's next start is closer than this many minutes
    turnaroundMinutes: number
    customColors: Partial<Record<SpeakerAccentKey, string>>
}

export const DEFAULT_SPEAKER_SETTINGS: SpeakerSettings = {
    themePreset: 'dark',
    scalePercent: 100,
    refreshSeconds: 20,
    turnaroundMinutes: 45,
    customColors: {},
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

export const loadSpeakerSettings = (): SpeakerSettings => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return DEFAULT_SPEAKER_SETTINGS
        const parsed = JSON.parse(raw) as Partial<SpeakerSettings>
        return {
            ...DEFAULT_SPEAKER_SETTINGS,
            ...parsed,
            customColors: parsed.customColors ?? {},
        }
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
