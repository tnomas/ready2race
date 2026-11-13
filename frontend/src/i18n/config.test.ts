import {beforeAll, describe, expect, it} from 'vitest'
import i18next from 'i18next'
import {i18nReady} from './config.ts'
import {i18nLanguage} from '@utils/helpers.ts'

beforeAll(async () => {
    await i18nReady
    await i18next.loadLanguages(['de', 'da'])
})

// Nur Englisch (Rückfallsprache und Quelle der Schlüsseltypen) liegt im Hauptbündel, Deutsch und
// Dänisch kommen als eigene Stücke nach.
describe('i18n-Nachladen', () => {
    it('lädt Deutsch und Dänisch über das Backend nach', () => {
        expect(i18next.hasResourceBundle('de', 'translations')).toBe(true)
        expect(i18next.hasResourceBundle('da', 'translations')).toBe(true)
        expect(i18next.getFixedT('de')('common.cancel')).toBe('Abbrechen')
        expect(i18next.getFixedT('en')('common.cancel')).toBe('Cancel')
    })
})

// Browser melden die Sprache mit Region. `i18nLanguage()` (MUI-Locale, Sprachwahl,
// E-Mail-Sprache) kennt nur `de`/`en`/`da` und fiel bei `de-DE` auf Englisch zurück.
describe('i18n-Spracherkennung', () => {
    it('macht aus Browsersprachen mit Region die unterstützte Sprache', () => {
        const utils = i18next.services.languageUtils
        expect(utils.getBestMatchFromCodes(['de-DE'])).toBe('de')
        expect(utils.getBestMatchFromCodes(['da-DK'])).toBe('da')
        expect(utils.getBestMatchFromCodes(['en-US'])).toBe('en')
        expect(utils.getBestMatchFromCodes(['fr-FR'])).toBe('en')
        expect(utils.getBestMatchFromCodes(['fr-FR', 'de-AT'])).toBe('de')
    })

    it('setzt bei erkannter Browsersprache de-DE die Sprache auf de', async () => {
        const detector = i18next.services.languageDetector
        const originalDetect = detector.detect
        const previous = i18next.language
        detector.detect = () => ['de-DE', 'de', 'en-US']
        try {
            await i18next.changeLanguage()
            expect(i18next.language).toBe('de')
            expect(i18nLanguage()).toBe('de')
            expect(i18next.t('common.cancel')).toBe('Abbrechen')
        } finally {
            detector.detect = originalDetect
            await i18next.changeLanguage(previous)
        }
    })
})

// React escaped beim Rendern selbst — i18next darf interpolierte Variablen deshalb nicht
// zusätzlich escapen. Ohne `escapeValue: false` wurde aus „Steuerfrau/mann" in Dialogen
// „Steuerfrau&#x2F;mann" (der Schrägstrich als HTML-Entity im Klartext).
describe('i18n-Interpolation', () => {
    it('escaped interpolierte Variablen mit Schrägstrich nicht zu HTML-Entities', () => {
        const t = i18next.getFixedT('de')
        const result = t('event.timing.races.deleteConfirm', {name: 'Steuerfrau/mann'})
        expect(result).toContain('Steuerfrau/mann')
        expect(result).not.toContain('&#x2F;')
    })

    it('lässt auch andere HTML-relevante Zeichen unangetastet', () => {
        const t = i18next.getFixedT('de')
        const result = t('event.timing.races.deleteConfirm', {name: 'A & B <Achter>'})
        expect(result).toContain('A & B <Achter>')
        expect(result).not.toContain('&amp;')
        expect(result).not.toContain('&lt;')
    })
})
