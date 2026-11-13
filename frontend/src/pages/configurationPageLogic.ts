import type {Privilege} from '@api/types.gen.ts'
import {readWebDavGlobal} from '@authorization/privileges.ts'

/**
 * Reine Regeln der Seite „Vorlagen & Stammdaten" (`/config`): Reiter, Sichtbarkeit, Auflösung von
 * `?tab=` und Sprunganker. Getrennt von der Komponente, damit sie ohne Rendern testbar sind.
 *
 * Bis zum 13.11.2026 gab es fünf Reiter, zwei davon mit sieben bzw. zehn gestapelten Tabellen.
 * Die Schlüssel der alten Reiter bleiben gültig (fremde Hinweis-Links zeigen auf sie); nur ihr
 * Inhalt ist kleiner. Blöcke, die umgezogen sind und von außen per Anker angesprungen werden
 * (`#startlists`, `#worktypes`), findet `resolveConfigurationTab` über den Anker.
 */

/** Reiter in Anzeigereihenfolge. */
export const CONFIGURATION_TABS = [
    'competition-templates',
    'competition-elements',
    'lists-timing',
    'event-elements',
    'organisation',
    'global-settings',
    'export-data',
] as const
export type ConfigurationTab = (typeof CONFIGURATION_TABS)[number]

/** Übersetzungsschlüssel von Reiterbeschriftung und Erklärsatz. */
export const CONFIGURATION_TAB_TEXT_KEYS = {
    'competition-templates': {
        label: 'configuration.tabs.competitionTemplates',
        description: 'configuration.tabs.description.competitionTemplates',
    },
    'competition-elements': {
        label: 'configuration.tabs.competitionElements',
        description: 'configuration.tabs.description.competitionElements',
    },
    'lists-timing': {
        label: 'configuration.tabs.listsTiming',
        description: 'configuration.tabs.description.listsTiming',
    },
    'event-elements': {
        label: 'configuration.tabs.eventElements',
        description: 'configuration.tabs.description.eventElements',
    },
    organisation: {
        label: 'configuration.tabs.organisation',
        description: 'configuration.tabs.description.organisation',
    },
    'global-settings': {
        label: 'configuration.tabs.globalSettings',
        description: 'configuration.tabs.description.globalSettings',
    },
    'export-data': {
        label: 'configuration.tabs.exportData',
        description: 'configuration.tabs.description.exportData',
    },
} as const satisfies Record<ConfigurationTab, {label: string; description: string}>

export const isConfigurationTab = (value: unknown): value is ConfigurationTab =>
    typeof value === 'string' && (CONFIGURATION_TABS as readonly string[]).includes(value)

export type ConfigurationSearch = {tab?: ConfigurationTab}

/** Für `configurationIndexRoute.validateSearch`: unbekannte Reiter fallen weg. */
export const validateConfigurationSearch = (
    search: Record<string, unknown>,
): ConfigurationSearch => ({
    tab: isConfigurationTab(search.tab) ? search.tab : undefined,
})

/**
 * Sichtbare Reiter. Die Seite selbst verlangt UPDATE EVENT GLOBAL (Route); darüber hinaus braucht
 * nur „Export / Import" ein eigenes Recht (READ WEBDAV GLOBAL), wie bisher.
 */
export function visibleConfigurationTabs(
    checkPrivilege: (privilege: Privilege) => boolean,
): ConfigurationTab[] {
    return CONFIGURATION_TABS.filter(
        tab => tab !== 'export-data' || checkPrivilege(readWebDavGlobal),
    )
}

/**
 * Sprunganker (`id` eines Blocks) → Reiter, in dem der Block heute liegt. Fremde Links tragen
 * noch den alten Reiter (`event-elements#worktypes`, `competition-elements#startlists`); der
 * Anker sagt eindeutiger als der Reiter, wohin sie wollen.
 */
export const CONFIGURATION_ANCHOR_TABS: Readonly<Record<string, ConfigurationTab>> = {
    startlists: 'lists-timing',
    worktypes: 'organisation',
}

export const tabForConfigurationAnchor = (
    hash: string | null | undefined,
): ConfigurationTab | undefined => {
    if (!hash) return undefined
    const anchor = decodeURIComponent(hash.startsWith('#') ? hash.slice(1) : hash)
    return Object.prototype.hasOwnProperty.call(CONFIGURATION_ANCHOR_TABS, anchor)
        ? CONFIGURATION_ANCHOR_TABS[anchor]
        : undefined
}

/**
 * Der gezeigte Reiter: zuerst der Reiter eines bekannten Ankers, dann der angefragte Reiter,
 * sonst der erste sichtbare. Ein unsichtbarer Reiter (Export ohne Recht) zählt wie ein unbekannter.
 */
export function resolveConfigurationTab(
    requested: unknown,
    hash: string | null | undefined,
    visible: readonly ConfigurationTab[],
): ConfigurationTab {
    const anchored = tabForConfigurationAnchor(hash)
    if (anchored && visible.includes(anchored)) return anchored
    if (isConfigurationTab(requested) && visible.includes(requested)) return requested
    return visible[0] ?? CONFIGURATION_TABS[0]
}
