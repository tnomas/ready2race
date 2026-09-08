import {describe, expect, it} from 'vitest'
import {DEFAULT_SPEAKER_SETTINGS, sanitizeSpeakerSettings} from './speakerSettings.ts'

describe('sanitizeSpeakerSettings', () => {
    it('lässt gültige Einstellungen unverändert durch', () => {
        const stored = {
            themePreset: 'light',
            scalePercent: 125,
            turnaroundMinutes: 60,
            customColors: {running: '#00ff00'},
            showTimeline: true,
            followLive: false,
            programShowFinished: false,
            programCompact: true,
            matchShowYears: false,
            timingTickerLimit: 15,
        }
        expect(sanitizeSpeakerSettings(stored)).toEqual(stored)
    })

    it('fällt bei Müll statt Objekt komplett auf die Vorgaben zurück', () => {
        expect(sanitizeSpeakerSettings(null)).toEqual(DEFAULT_SPEAKER_SETTINGS)
        expect(sanitizeSpeakerSettings('dark')).toEqual(DEFAULT_SPEAKER_SETTINGS)
        expect(sanitizeSpeakerSettings([1, 2])).toEqual(DEFAULT_SPEAKER_SETTINGS)
    })

    it('kennt nur die drei Paletten - fremde Namen werden zur Vorgabe', () => {
        // Ein unbekannter Name lief bislang in PRESET_PALETTES[...] und ergab undefined -
        // das Board stand dann ohne eine einzige Farbe da.
        expect(sanitizeSpeakerSettings({themePreset: 'neon'}).themePreset).toBe('dark')
        expect(sanitizeSpeakerSettings({themePreset: 42}).themePreset).toBe('dark')
    })

    it('klemmt die Skalierung auf den Regler-Bereich', () => {
        expect(sanitizeSpeakerSettings({scalePercent: 900}).scalePercent).toBe(150)
        expect(sanitizeSpeakerSettings({scalePercent: 10}).scalePercent).toBe(75)
        expect(sanitizeSpeakerSettings({scalePercent: 'groß'}).scalePercent).toBe(100)
        expect(sanitizeSpeakerSettings({scalePercent: NaN}).scalePercent).toBe(100)
    })

    it('klemmt Wechselzeit und Ticker-Länge auf die angebotenen Werte', () => {
        expect(sanitizeSpeakerSettings({turnaroundMinutes: 5}).turnaroundMinutes).toBe(20)
        expect(sanitizeSpeakerSettings({turnaroundMinutes: 1000}).turnaroundMinutes).toBe(90)
        expect(sanitizeSpeakerSettings({timingTickerLimit: 0}).timingTickerLimit).toBe(5)
        expect(sanitizeSpeakerSettings({timingTickerLimit: 99}).timingTickerLimit).toBe(25)
        expect(sanitizeSpeakerSettings({timingTickerLimit: 'viele'}).timingTickerLimit).toBe(8)
    })

    it('nimmt Schalter nur als echte Wahrheitswerte', () => {
        expect(sanitizeSpeakerSettings({followLive: 'nein'}).followLive).toBe(true)
        expect(sanitizeSpeakerSettings({showTimeline: 1}).showTimeline).toBe(false)
        expect(sanitizeSpeakerSettings({programCompact: true}).programCompact).toBe(true)
    })

    it('behält nur bekannte Akzentfarben in Hex-Schreibweise', () => {
        expect(
            sanitizeSpeakerSettings({
                customColors: {
                    running: '#34d399',
                    upcoming: 'red',
                    gold: '#facc15',
                    now: 12,
                },
            }).customColors,
        ).toEqual({running: '#34d399'})
        expect(sanitizeSpeakerSettings({customColors: 'bunt'}).customColors).toEqual({})
    })

    it('ergänzt fehlende Felder je Feld aus den Vorgaben', () => {
        expect(sanitizeSpeakerSettings({scalePercent: 110})).toEqual({
            ...DEFAULT_SPEAKER_SETTINGS,
            scalePercent: 110,
        })
    })
})
