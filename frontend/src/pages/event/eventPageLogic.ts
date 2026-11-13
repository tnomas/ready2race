import {EventDto, Privilege} from '@api/types.gen.ts'
import {readClubOwn, readEventGlobal, updateEventGlobal} from '@authorization/privileges.ts'

/**
 * Reine Regeln der Veranstaltungsseite (Kopf, Ergebnisse & Urkunden, Einstellungen), getrennt von
 * den Komponenten, damit sie ohne Rendern testbar sind. Die Sichtbarkeit der Bereiche selbst
 * steht in `eventSections.ts`.
 */

/**
 * Bearbeiten-Knopf im Seitenkopf: dasselbe Recht wie „Bearbeiten" im ⋮-Menü der
 * Veranstaltungsliste (`EntityTable` mit `resource: 'EVENT'` prüft UPDATE EVENT ab OWN; GLOBAL
 * schließt OWN ein).
 */
export const updateEventAnyScope: Privilege = {action: 'UPDATE', resource: 'EVENT', scope: 'OWN'}

export const canEditEvent = (checkPrivilege: (privilege: Privilege) => boolean): boolean =>
    checkPrivilege(updateEventAnyScope)

/**
 * Aktionen im Bereich „Ergebnisse & Urkunden". Sie standen bis zum 13.11.2026 verteilt auf der
 * Übersicht und unter der Wettkampftabelle; die Bedingungen sind wörtlich übernommen — niemand
 * sieht hier etwas, das er vorher nicht sah.
 */
export type ResultActionId =
    /** Sprung zur öffentlichen Ergebnisseite — für alle. */
    | 'publicResults'
    /** Bisherige Ergebnisse als PDF — Veranstaltung lesen oder veröffentlicht; keine Challenge. */
    | 'downloadResults'
    /** Ergebnisliste (Dialog) — Veranstaltung lesen; keine Challenge. */
    | 'resultList'
    /** Siegerehrungsbogen (Dialog) — Veranstaltung lesen; keine Challenge. */
    | 'awardCeremony'
    /** Siegerurkunden (Dialog) — Veranstaltung lesen; keine Challenge. */
    | 'awardCertificates'
    /** Teilnahmeurkunden versenden — Veranstaltung ändern; Challenge beendet. */
    | 'sendParticipationCertificates'
    /** Teilnahmeurkunden des eigenen Vereins (PDF/Word) — Verein lesen (OWN), Challenge beendet. */
    | 'downloadParticipationCertificates'

export type ResultActionViewer = {
    checkPrivilege: (privilege: Privilege) => boolean
    loggedIn: boolean
    clubId?: string | null
}

export type ResultActionEvent = Pick<
    EventDto,
    'published' | 'challengeEvent' | 'challengesFinished'
>

export function visibleResultActions(
    viewer: ResultActionViewer,
    event: ResultActionEvent,
): ResultActionId[] {
    const can = viewer.checkPrivilege
    const readEvent = can(readEventGlobal)
    const challengeDone = event.challengeEvent && event.challengesFinished === true
    const actions: ResultActionId[] = ['publicResults']
    if ((readEvent || event.published) && !event.challengeEvent) actions.push('downloadResults')
    if (readEvent && !event.challengeEvent) {
        actions.push('resultList', 'awardCeremony', 'awardCertificates')
    }
    if (can(updateEventGlobal) && challengeDone) actions.push('sendParticipationCertificates')
    if (can(readClubOwn) && viewer.loggedIn && Boolean(viewer.clubId) && challengeDone) {
        actions.push('downloadParticipationCertificates')
    }
    return actions
}

/**
 * Zeitraum der Veranstaltung aus den Daten ihrer Tage (`EventDayDto.date`, `yyyy-MM-dd`): frühester
 * und spätester Tag, `null` ohne Tage. Ein einzelner Tag liefert `from === to`.
 */
export function eventDateRange(dates: readonly string[]): {from: string; to: string} | null {
    const valid = dates.filter(d => /^\d{4}-\d{2}-\d{2}/.test(d)).map(d => d.slice(0, 10))
    if (valid.length === 0) return null
    const sorted = [...valid].sort()
    return {from: sorted[0], to: sorted[sorted.length - 1]}
}

/**
 * Die Blöcke des Bereichs „Einstellungen" mit ihren Sprungankern (`#…` in der Adresse). Die
 * Reihenfolge ist die der Seite und der Sprungleiste.
 */
export const EVENT_SETTINGS_ANCHORS = [
    'rating-categories',
    'execution',
    'timing',
    'documents',
    'requirements',
] as const
export type EventSettingsAnchor = (typeof EVENT_SETTINGS_ANCHORS)[number]

/** Präfix der Element-IDs, damit die Anker nicht mit anderen IDs der Seite kollidieren. */
export const settingsAnchorId = (anchor: EventSettingsAnchor): string => `event-settings-${anchor}`

/**
 * Welcher Block laut Adresse angesprungen werden soll. Nimmt den Hash mit oder ohne `#` und
 * sowohl den kurzen Anker (`timing`) als auch die volle Element-ID (`event-settings-timing`).
 */
export function settingsAnchorFromHash(
    hash: string | undefined | null,
): EventSettingsAnchor | null {
    if (!hash) return null
    const raw = decodeURIComponent(hash.startsWith('#') ? hash.slice(1) : hash)
    const short = raw.startsWith('event-settings-') ? raw.slice('event-settings-'.length) : raw
    return (EVENT_SETTINGS_ANCHORS as readonly string[]).includes(short)
        ? (short as EventSettingsAnchor)
        : null
}
