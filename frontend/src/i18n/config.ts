import i18next, {type BackendModule, type ReadCallback} from 'i18next'
import {initReactI18next} from 'react-i18next'
import I18nextBrowserLanguageDetector from 'i18next-browser-languagedetector'
import enTrans from './en/translations.json'
import {Locale as DateLocale} from 'date-fns'
import {de} from 'date-fns/locale/de'
import {da} from 'date-fns/locale/da'
import {Localization as MaterialLocale} from '@mui/material/locale'
import {Localization as DataGridLocale} from '@mui/x-data-grid/internals'
import {deDE as deMaterial, enUS as enMaterial, daDK as daMaterial} from '@mui/material/locale'
import {enUS as enDataGrid} from '@mui/x-data-grid/locales/enUS'
import {deDE as deDataGrid} from '@mui/x-data-grid/locales/deDE'
import {daDK as daDataGrid} from '@mui/x-data-grid/locales/daDK'
import {enUS as enDatePicker} from '@mui/x-date-pickers/locales/enUS'
import {deDE as deDatePicker} from '@mui/x-date-pickers/locales/deDE'
import {daDK as daDatePicker} from '@mui/x-date-pickers/locales/daDK'
import {PickersLocaleText} from '@mui/x-date-pickers'
import {isFromUnion} from '@utils/helpers.ts'
import {loadChunk} from '@utils/chunkReload.ts'

export const LANGUAGES = ['de', 'en', 'da'] as const
export type Language = (typeof LANGUAGES)[number]
export const isLanguage = (s: string | undefined) => isFromUnion(s, LANGUAGES)

export type Locale = {
    date: DateLocale | undefined
    material: MaterialLocale
    dataGrid: DataGridLocale
    datePicker: Partial<PickersLocaleText<Date>>
}

export const locales: Record<Language, Locale> = {
    de: {
        date: de,
        material: deMaterial,
        dataGrid: deDataGrid,
        datePicker: deDatePicker.components.MuiLocalizationProvider.defaultProps.localeText,
    },
    da: {
        date: da,
        material: daMaterial,
        dataGrid: daDataGrid,
        datePicker: daDatePicker.components.MuiLocalizationProvider.defaultProps.localeText,
    },
    en: {
        date: undefined,
        material: enMaterial,
        dataGrid: enDataGrid,
        datePicker: enDatePicker.components.MuiLocalizationProvider.defaultProps.localeText,
    },
}

export const languageNames: Record<Language, string> = {
    de: 'deutsch',
    en: 'english',
    da: 'dansk',
}

export const fallbackLng: Language = 'en'
export const defaultNS = 'translations'

// Nur die Rückfallsprache liegt im Hauptbündel. Sie ist zugleich die Quelle der Schlüsseltypen
// (`strictKeyChecks` in `@types/i18next.d.ts` liest `typeof resources['en']`), daran ändert das
// Nachladen nichts. Deutsch und Dänisch kommen als eigene Stücke: die aktive Sprache gleich beim
// Start (die Wurzelroute wartet auf `i18nReady`), die übrigen erst beim Umschalten.
// Englisch bleibt statisch, weil i18next die Rückfallsprache ohnehin immer mitlädt - wäre sie ein
// eigenes Stück, holte jede deutsche Sitzung beim Start zwei Sprachdateien statt einer.
export const resources = {
    en: {
        translations: enTrans,
    },
} as const

type LazyLanguage = Exclude<Language, 'en'>

const lazyTranslations: Record<LazyLanguage, () => Promise<{default: object}>> = {
    de: () => import('./de/translations.json'),
    da: () => import('./da/translations.json'),
}

const isLazyLanguage = (language: string): language is LazyLanguage =>
    Object.prototype.hasOwnProperty.call(lazyTranslations, language)

/**
 * Lädt Sprachdateien als eigene Stücke nach. i18next fragt dabei die ganze Sprachkette ab
 * (z. B. `de-DE`, `de`, `en`); Varianten ohne eigene Datei bekommen sofort ein leeres Bündel,
 * sonst versuchte i18next sie mehrfach mit Wartezeit erneut.
 */
const lazyTranslationBackend: BackendModule = {
    type: 'backend',
    init: () => {},
    read: (language: string, namespace: string, callback: ReadCallback) => {
        if (namespace !== defaultNS || !isLazyLanguage(language)) {
            callback(null, {})
            return
        }
        loadChunk(lazyTranslations[language]).then(
            module => callback(null, module.default),
            (error: unknown) =>
                callback(error instanceof Error ? error : new Error(String(error)), false),
        )
    },
}

/**
 * Eine Einbettung gibt die Sprache über `data-lng` am Wurzelelement vor (App.tsx stellt sie danach
 * ein). Seit Sprachen nachgeladen werden, liefen Erkennung und Vorgabe sonst um die Wette - wer
 * zuletzt fertig wird, setzt die Sprache. Deshalb startet i18next gleich mit der Vorgabe.
 * Bewusst ohne `isLanguage`: helpers.ts und diese Datei importieren einander, beim Auswerten
 * dieser Zeile ist `isFromUnion` womöglich noch nicht da.
 */
const embeddedLanguage = (() => {
    if (typeof document === 'undefined') return undefined
    const lng = document.getElementById('ready2race-root')?.dataset.lng
    return lng !== undefined && (LANGUAGES as readonly string[]).includes(lng) ? lng : undefined
})()

/**
 * Erfüllt sich, sobald die beim Start erkannte Sprache geladen ist (auch wenn das Laden scheitert:
 * dann greift die Rückfallsprache). Die Wurzelroute wartet darauf, damit keine Seite kurz in der
 * falschen Sprache aufblitzt.
 */
export const i18nReady: Promise<unknown> = i18next
    .use(I18nextBrowserLanguageDetector)
    .use(lazyTranslationBackend)
    .use(initReactI18next)
    .init({
        lng: embeddedLanguage,
        resources,
        partialBundledLanguages: true,
        // Ohne ausdrückliche Liste fragte i18next beim Backend den Standard-Namensraum
        // „translation" ab statt „translations".
        ns: [defaultNS],
        defaultNS,
        fallbackLng,
        // Die Browsersprache kommt mit Region (`de-DE`, `da-DK`). Ohne Liste übernahm i18next sie
        // wörtlich als `i18next.language`; die Texte stimmten (Kette `de-DE` → `de`), aber alles,
        // was die Sprache selbst liest (`i18nLanguage()`: MUI-/Datums-Locale, Sprachwahl,
        // E-Mail-Sprache), fiel auf Englisch zurück. Mit der Liste wählt i18next den
        // unterstützten Sprachteil (`de`). Bewusst ohne `load: 'languageOnly'`: damit hielte
        // i18next `de-DE` selbst für unterstützt und behielte es.
        supportedLngs: [...LANGUAGES],
        interpolation: {
            skipOnVariables: false,
            // React escaped beim Rendern selbst — ohne diese Option escaped i18next interpolierte
            // Variablen zusätzlich und HTML-Entities wie &#x2F; erschienen als Klartext in Dialogen
            // (z. B. „Steuerfrau&#x2F;mann" statt „Steuerfrau/mann").
            escapeValue: false,
        },
        react: {
            // Während die Startsprache lädt, darf `useTranslation` nicht suspendieren: Oberhalb
            // des Routers (Provider in App.tsx) gibt es keine Suspense-Grenze. Sichtbare Texte
            // rendert erst der Router, und der wartet auf `i18nReady`.
            useSuspense: false,
        },
    })
