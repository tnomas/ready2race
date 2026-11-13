import type {EventSectionKey} from '../../pages/event/eventSections.ts'
import {DEFAULT_EVENT_SECTION, sectionForRoute} from '../../pages/event/eventSections.ts'
import type {CompetitionTab} from '@components/event/competition/common.ts'
import type {CompetitionSearch} from '../../pages/event/competitionPageLogic.ts'
import {competitionTabSearch, isCompetitionTab} from '../../pages/event/competitionPageLogic.ts'

/**
 * Reine Regeln des Schnellsprungs in der Kopfleiste (`components/appbar/QuickJump.tsx`): wann das
 * Tastenkürzel greift, welche Treffer in welcher Reihenfolge erscheinen und wohin ein Treffer
 * springt. Ohne React, damit Vitest sie ohne Rendern prüft.
 *
 * Gesucht wird in drei Gruppen, in fester Reihenfolge: die sichtbaren Bereiche der aktuellen
 * Veranstaltung, deren Wettkämpfe (Kennung, Kurzname, Name) und Veranstaltungen (die Liste filtert
 * der Server, hier wird nur noch gereiht).
 */

export type QuickJumpGroup = 'sections' | 'competitions' | 'events'

/** Anzeigereihenfolge der Gruppen im Aufklappfeld. */
export const QUICK_JUMP_GROUPS: readonly QuickJumpGroup[] = ['sections', 'competitions', 'events']

/** Veranstaltungen werden erst ab so vielen Zeichen beim Server gesucht. */
export const QUICK_JUMP_MIN_EVENT_QUERY = 2

/** Wartezeit nach dem letzten Tastendruck, bevor Veranstaltungen gesucht werden. */
export const QUICK_JUMP_DEBOUNCE_MS = 250

/** Höchstzahl Treffer je Gruppe für Wettkämpfe und Veranstaltungen; Bereiche erscheinen alle. */
export const QUICK_JUMP_GROUP_LIMIT = 8

export type QuickJumpSectionOption = {
    kind: 'section'
    id: string
    eventId: string
    section: EventSectionKey
    label: string
}

export type QuickJumpCompetitionOption = {
    kind: 'competition'
    id: string
    eventId: string
    competitionId: string
    identifier: string
    shortName?: string
    name: string
    label: string
}

export type QuickJumpEventOption = {
    kind: 'event'
    id: string
    eventId: string
    name: string
    firstEventDay?: string
    lastEventDay?: string
    label: string
}

export type QuickJumpOption =
    | QuickJumpSectionOption
    | QuickJumpCompetitionOption
    | QuickJumpEventOption

export const quickJumpGroup = (option: QuickJumpOption): QuickJumpGroup =>
    option.kind === 'section'
        ? 'sections'
        : option.kind === 'competition'
          ? 'competitions'
          : 'events'

/**
 * Für Vergleiche: Kleinschreibung, ohne Akzente („Über" findet sich auch mit „uber"), Leerraum
 * zusammengezogen.
 */
export const normalizeQuickJumpText = (text: string): string =>
    text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

const WORD_SEPARATOR = /[\s|\-_/.,:;()[\]]+/

/**
 * Wie gut ein Suchbegriff auf eines der Felder passt; kleiner ist besser, `null` heißt kein
 * Treffer:
 * 0 genau gleich · 1 Feld beginnt damit · 2 ein Wort beginnt damit · 3 irgendwo enthalten ·
 * 4 mehrere Suchwörter, jedes irgendwo enthalten.
 * Ein leerer Suchbegriff passt auf alles (Rang 0).
 */
export function quickJumpMatchRank(
    query: string,
    fields: readonly (string | undefined | null)[],
): number | null {
    const q = normalizeQuickJumpText(query)
    if (q === '') return 0
    const values = fields
        .filter((f): f is string => typeof f === 'string' && f.trim() !== '')
        .map(normalizeQuickJumpText)
    if (values.length === 0) return null

    let best: number | null = null
    const consider = (rank: number) => {
        if (best === null || rank < best) best = rank
    }
    for (const value of values) {
        if (value === q) consider(0)
        else if (value.startsWith(q)) consider(1)
        else if (value.split(WORD_SEPARATOR).some(word => word !== '' && word.startsWith(q)))
            consider(2)
        else if (value.includes(q)) consider(3)
    }
    if (best !== null) return best

    const terms = q.split(' ').filter(term => term !== '')
    if (terms.length > 1) {
        const joined = values.join(' ')
        if (terms.every(term => joined.includes(term))) return 4
    }
    return null
}

/** Stabil nach Rang sortieren; gleicher Rang behält die gelieferte Reihenfolge. */
const byRank = <T>(ranked: {item: T; rank: number}[]): T[] =>
    ranked
        .map((entry, index) => ({...entry, index}))
        .sort((a, b) => a.rank - b.rank || a.index - b.index)
        .map(entry => entry.item)

export type QuickJumpSectionInput = {key: EventSectionKey; label: string}

/** Bereiche, die zum Suchbegriff passen; ohne Suchbegriff alle (in Seitenleisten-Reihenfolge). */
export function rankQuickJumpSections(
    query: string,
    eventId: string,
    sections: readonly QuickJumpSectionInput[],
): QuickJumpSectionOption[] {
    const ranked: {item: QuickJumpSectionOption; rank: number}[] = []
    for (const s of sections) {
        const rank = quickJumpMatchRank(query, [s.label])
        if (rank === null) continue
        ranked.push({
            rank,
            item: {
                kind: 'section',
                id: `section:${s.key}`,
                eventId,
                section: s.key,
                label: s.label,
            },
        })
    }
    return byRank(ranked)
}

export type QuickJumpCompetitionInput = {
    id: string
    properties: {identifier: string; name: string; shortName?: string}
}

const compareIdentifiers = (a: string, b: string) =>
    a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'})

/**
 * Wettkämpfe nach Kennung, Kurzname oder Name. Erst ab einem Zeichen – ohne Suchbegriff wären es
 * bei einer Regatta schnell hundert Einträge. Gleicher Rang sortiert nach Kennung („2" vor „10").
 */
export function rankQuickJumpCompetitions(
    query: string,
    eventId: string,
    competitions: readonly QuickJumpCompetitionInput[],
): QuickJumpCompetitionOption[] {
    if (normalizeQuickJumpText(query) === '') return []
    const ranked: {item: QuickJumpCompetitionOption; rank: number}[] = []
    const sorted = [...competitions].sort((a, b) =>
        compareIdentifiers(a.properties.identifier, b.properties.identifier),
    )
    for (const c of sorted) {
        const {identifier, name, shortName} = c.properties
        const rank = quickJumpMatchRank(query, [
            identifier,
            shortName,
            name,
            `${identifier} ${shortName ?? ''}`,
            `${identifier} ${name}`,
        ])
        if (rank === null) continue
        ranked.push({
            rank,
            item: {
                kind: 'competition',
                id: `competition:${c.id}`,
                eventId,
                competitionId: c.id,
                identifier,
                shortName,
                name,
                label: [identifier, shortName, name].filter(Boolean).join(' · '),
            },
        })
    }
    return byRank(ranked).slice(0, QUICK_JUMP_GROUP_LIMIT)
}

export type QuickJumpEventInput = {
    id: string
    name: string
    firstEventDay?: string
    lastEventDay?: string
}

/** Darf (und soll) für diesen Suchbegriff beim Server nach Veranstaltungen gesucht werden? */
export const shouldSearchQuickJumpEvents = (query: string): boolean =>
    query.trim().length >= QUICK_JUMP_MIN_EVENT_QUERY

/**
 * Veranstaltungen aus der Serversuche. Der Server findet auch über die Beschreibung; solche
 * Treffer bleiben, stehen aber hinter Treffern im Namen.
 */
export function rankQuickJumpEvents(
    query: string,
    events: readonly QuickJumpEventInput[],
): QuickJumpEventOption[] {
    if (!shouldSearchQuickJumpEvents(query)) return []
    const ranked = events.map(e => ({
        rank: quickJumpMatchRank(query, [e.name]) ?? 5,
        item: {
            kind: 'event' as const,
            id: `event:${e.id}`,
            eventId: e.id,
            name: e.name,
            firstEventDay: e.firstEventDay,
            lastEventDay: e.lastEventDay,
            label: e.name,
        },
    }))
    return byRank(ranked).slice(0, QUICK_JUMP_GROUP_LIMIT)
}

/** Alle Treffer in Gruppenreihenfolge – so verlangt es `Autocomplete` mit `groupBy`. */
export function buildQuickJumpOptions(groups: {
    sections?: readonly QuickJumpSectionOption[]
    competitions?: readonly QuickJumpCompetitionOption[]
    events?: readonly QuickJumpEventOption[]
}): QuickJumpOption[] {
    return [...(groups.sections ?? []), ...(groups.competitions ?? []), ...(groups.events ?? [])]
}

/** Wo man gerade steht: die Veranstaltung und – auf einer Wettkampfseite – deren Reiter. */
export type QuickJumpContext = {
    eventId: string
    /** Gesetzt nur auf einer Wettkampfseite (ohne `?tab=` der Standardreiter). */
    competitionTab?: CompetitionTab
}

const COMPETITION_PAGE_PATH = /\/event\/[^/]+\/competition\/[^/]+\/?$/

/**
 * Der Kontext aus der Adresse. Außerhalb einer Veranstaltung `null`; dann bietet der Schnellsprung
 * nur Veranstaltungen an.
 */
export function quickJumpContext(
    pathname: string,
    search: Record<string, unknown> | undefined,
    basepath: string = '/',
): QuickJumpContext | null {
    const route = sectionForRoute(pathname, search, basepath)
    if (route === null) return null
    if (!COMPETITION_PAGE_PATH.test(pathname)) return {eventId: route.eventId}
    const tab = search?.tab
    return {eventId: route.eventId, competitionTab: isCompetitionTab(tab) ? tab : 'general'}
}

export type QuickJumpTarget =
    | {
          to: '/event/$eventId'
          params: {eventId: string}
          search: {tab?: EventSectionKey}
      }
    | {
          to: '/event/$eventId/competition/$competitionId'
          params: {eventId: string; competitionId: string}
          search: CompetitionSearch
      }

/**
 * Wohin ein Treffer springt. Ein Wettkampf behält den Reiter der aktuellen Wettkampfseite (die
 * Zielseite fällt selbst auf einen sichtbaren Reiter zurück, `resolveCompetitionTab`).
 */
export function quickJumpTarget(
    option: QuickJumpOption,
    context: QuickJumpContext | null,
): QuickJumpTarget {
    switch (option.kind) {
        case 'section':
            return {
                to: '/event/$eventId',
                params: {eventId: option.eventId},
                search: {
                    tab: option.section === DEFAULT_EVENT_SECTION ? undefined : option.section,
                },
            }
        case 'competition':
            return {
                to: '/event/$eventId/competition/$competitionId',
                params: {eventId: option.eventId, competitionId: option.competitionId},
                search:
                    context?.competitionTab !== undefined && context.eventId === option.eventId
                        ? competitionTabSearch(context.competitionTab)
                        : {},
            }
        case 'event':
            return {to: '/event/$eventId', params: {eventId: option.eventId}, search: {}}
    }
}

/** Was das Tastenkürzel über den Tastendruck wissen muss (Ausschnitt aus `KeyboardEvent`). */
export type QuickJumpKeyInput = {
    key: string
    ctrlKey: boolean
    metaKey: boolean
    altKey: boolean
    defaultPrevented: boolean
    isComposing?: boolean
}

/** Ausschnitt aus dem fokussierten Element. */
export type QuickJumpFocusTarget = {
    tagName?: string
    isContentEditable?: boolean
    getAttribute?: (name: string) => string | null
} | null

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])
const EDITABLE_ROLES = new Set(['textbox', 'searchbox', 'combobox', 'spinbutton'])

/** Liegt der Fokus in einem Eingabefeld? Dann ist „/" ein Zeichen, kein Kürzel. */
export const isEditableTarget = (target: QuickJumpFocusTarget): boolean => {
    if (!target) return false
    if (target.isContentEditable) return true
    if (target.tagName && EDITABLE_TAGS.has(target.tagName.toUpperCase())) return true
    const role = target.getAttribute?.('role')
    return role != null && EDITABLE_ROLES.has(role)
}

/**
 * Öffnet „/" den Schnellsprung? Nur ohne Zusatztaste, nicht beim Tippen in einem Feld, nicht
 * während einer Zeichenkomposition und nicht, solange ein Dialog oder Menü offen ist (der
 * Schnellsprung läge sonst hinter dessen Abdeckung).
 */
export const isQuickJumpShortcut = (
    event: QuickJumpKeyInput,
    target: QuickJumpFocusTarget,
    modalOpen: boolean,
): boolean =>
    event.key === '/' &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.defaultPrevented &&
    !event.isComposing &&
    !modalOpen &&
    !isEditableTarget(target)
