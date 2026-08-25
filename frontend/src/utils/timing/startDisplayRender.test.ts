import {describe, expect, test} from 'vitest'
import {StartDisplaySettingsDto, TimingTeamDto} from '@api/types.gen.ts'
import {DEFAULT_START_DISPLAY} from './startDisplay.ts'
import {scaledFontSize, startDisplayLabel} from './startDisplayRender.ts'

const settings = (overrides: Partial<StartDisplaySettingsDto> = {}): StartDisplaySettingsDto => ({
    ...DEFAULT_START_DISPLAY,
    ...overrides,
})

const team = (overrides: Partial<TimingTeamDto> = {}): TimingTeamDto => ({
    competitionMatchTeam: '00000000-0000-0000-0000-0000000000a1',
    startNumber: 7,
    teamName: 'Boot Nord',
    clubName: 'Hochschulrudern Flensburg',
    participantNames: ['Ilka B.', 'Jonas K.'],
    matchPhase: 'OPEN',
    ...overrides,
})

describe('startDisplayLabel', () => {
    test('Vorgabe: Startnummer, Bootsname und Verein, ohne laufende Nummer', () => {
        expect(startDisplayLabel(settings(), team(), 'fallback', 0)).toBe(
            '#7 · Boot Nord · Hochschulrudern Flensburg',
        )
    })

    test('showPosition stellt die 1-basierte laufende Nummer voran', () => {
        expect(startDisplayLabel(settings({showPosition: true}), team(), 'fallback', 2)).toBe(
            '3. #7 · Boot Nord · Hochschulrudern Flensburg',
        )
    })

    test('ohne Position-Angabe bleibt die laufende Nummer weg, auch wenn der Schalter an ist', () => {
        expect(startDisplayLabel(settings({showPosition: true}), team(), 'fallback')).toBe(
            '#7 · Boot Nord · Hochschulrudern Flensburg',
        )
    })

    test('der am Wasser beobachtete Doppelbefund kommt nicht wieder: Nummer aus, Startnummer an', () => {
        // „1. #1 · Hochschulrudern Flensburg" war der Fehler — die Vorgabe zeigt die Zahl genau
        // einmal, und zwar als Startnummer.
        const label = startDisplayLabel(
            settings(),
            team({startNumber: 1, teamName: undefined, clubName: 'Hochschulrudern Flensburg'}),
            'fallback',
            0,
        )
        expect(label).toBe('#1 · Hochschulrudern Flensburg')
    })

    test('Athletennamen erscheinen nur mit eingeschaltetem Schalter, mit / getrennt', () => {
        expect(
            startDisplayLabel(
                settings({showAthleteNames: true, showTeamName: false, showClubName: false}),
                team(),
                'fallback',
            ),
        ).toBe('#7 · Ilka B. / Jonas K.')
    })

    test('eingeschaltete, aber leere Felder fallen still heraus statt leere Trenner zu erzeugen', () => {
        expect(
            startDisplayLabel(
                settings({showAthleteNames: true}),
                team({teamName: undefined, participantNames: []}),
                'fallback',
            ),
        ).toBe('#7 · Hochschulrudern Flensburg')
    })

    test('alles abgeschaltet: Rückfall auf die Standard-Beschriftung statt einer leeren Zeile', () => {
        const label = startDisplayLabel(
            settings({
                showStartNumber: false,
                showTeamName: false,
                showClubName: false,
                showAthleteNames: false,
            }),
            team(),
            'fallback',
        )
        expect(label).toBe('#7 · Boot Nord')
    })

    test('unbekanntes Team: die Kennung, mit laufender Nummer wenn eingeschaltet', () => {
        expect(startDisplayLabel(settings(), undefined, 'team-id', 0)).toBe('team-id')
        expect(startDisplayLabel(settings({showPosition: true}), undefined, 'team-id', 0)).toBe(
            '1. team-id',
        )
    })
})

describe('scaledFontSize', () => {
    test('Faktor 1 lässt den Ausdruck unangetastet', () => {
        expect(scaledFontSize('clamp(4rem, 24vmin, 18rem)', 1)).toBe('clamp(4rem, 24vmin, 18rem)')
    })

    test('multipliziert den vorhandenen Ausdruck statt ihn zu ersetzen', () => {
        expect(scaledFontSize('clamp(4rem, 24vmin, 18rem)', 1.5)).toBe(
            'calc(clamp(4rem, 24vmin, 18rem) * 1.5)',
        )
    })

    test('kappt an den Grenzen — kein Datensatz darf die Anzeige unsichtbar machen', () => {
        expect(scaledFontSize('2rem', 0)).toBe('calc(2rem * 0.5)')
        expect(scaledFontSize('2rem', 99)).toBe('calc(2rem * 3)')
    })

    test('unbrauchbare Zahlen lassen die eingebaute Größe stehen', () => {
        expect(scaledFontSize('2rem', Number.NaN)).toBe('2rem')
    })
})
