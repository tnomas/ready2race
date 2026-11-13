import type {SvgIconComponent} from '@mui/icons-material'
import AssignmentOutlined from '@mui/icons-material/AssignmentOutlined'
import CalendarMonthOutlined from '@mui/icons-material/CalendarMonthOutlined'
import EmojiEventsOutlined from '@mui/icons-material/EmojiEventsOutlined'
import GroupsOutlined from '@mui/icons-material/GroupsOutlined'
import HomeOutlined from '@mui/icons-material/HomeOutlined'
import PeopleOutlined from '@mui/icons-material/PeopleOutlined'
import PlayCircleOutlined from '@mui/icons-material/PlayCircleOutlined'
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined'
import SettingsOutlined from '@mui/icons-material/SettingsOutlined'
import WorkspacePremiumOutlined from '@mui/icons-material/WorkspacePremiumOutlined'
import {Action, Privilege, Resource, Scope} from '@api/types.gen.ts'
import {
    createInvoiceGlobal,
    readEventGlobal,
    readRegistrationGlobal,
    readRegistrationOwn,
    readUserGlobal,
} from '@authorization/privileges.ts'
import {visibleBetriebTiles} from './tabs/betriebTiles.ts'

/**
 * Das Bereichsmodell der Veranstaltung: welche Bereiche es gibt, in welcher Lebenszyklus-Gruppe
 * sie stehen, wer sie sieht und welcher Bereich auf einer beliebigen Unterseite aktiv ist.
 *
 * EINE Quelle der Wahrheit für die Seitenleiste, die Bereichsauswahl auf dem Handy, die
 * Veranstaltungsseite (welches Panel gerendert wird) und den Rückfall bei ungültigen
 * `?tab=`-Werten. Wer einen Bereich hinzufügt oder eine Sichtbarkeitsregel ändert, tut das hier
 * und nirgends sonst.
 *
 * Die Schlüssel sind die bisherigen `?tab=`-Werte der Veranstaltungsseite und bleiben gültig
 * (Links aus Hinweisen, Kacheln und Lesezeichen); neu ist nur `results`.
 */

export const EVENT_SECTION_KEYS = [
    'general',
    'competitions',
    'settings',
    'registrations',
    'participants',
    'invoices',
    'schedule',
    'betrieb',
    'organization',
    'results',
] as const
export type EventSectionKey = (typeof EVENT_SECTION_KEYS)[number]

/** Lebenszyklus einer Regatta. Die Übersicht steht über allen Gruppen (`group: null`). */
export const EVENT_SECTION_GROUPS = ['preparation', 'registration', 'raceDay', 'followUp'] as const
export type EventSectionGroup = (typeof EVENT_SECTION_GROUPS)[number]

export const EVENT_SECTION_GROUP_LABEL_KEYS = {
    preparation: 'nav.event.groups.preparation',
    registration: 'nav.event.groups.registration',
    raceDay: 'nav.event.groups.raceDay',
    followUp: 'nav.event.groups.followUp',
} as const satisfies Record<EventSectionGroup, string>

export type EventSection = {
    key: EventSectionKey
    group: EventSectionGroup | null
    labelKey: (typeof EVENT_SECTION_LABEL_KEYS)[EventSectionKey]
    icon: SvgIconComponent
}

const EVENT_SECTION_LABEL_KEYS = {
    general: 'nav.event.sections.general',
    competitions: 'nav.event.sections.competitions',
    settings: 'nav.event.sections.settings',
    registrations: 'nav.event.sections.registrations',
    participants: 'nav.event.sections.participants',
    invoices: 'nav.event.sections.invoices',
    schedule: 'nav.event.sections.schedule',
    betrieb: 'nav.event.sections.betrieb',
    organization: 'nav.event.sections.organization',
    results: 'nav.event.sections.results',
} as const satisfies Record<EventSectionKey, string>

const section = (
    key: EventSectionKey,
    group: EventSectionGroup | null,
    icon: SvgIconComponent,
): EventSection => ({key, group, labelKey: EVENT_SECTION_LABEL_KEYS[key], icon})

/**
 * Alle Bereiche in Anzeigereihenfolge. Die Reihenfolge ist die der Seitenleiste; Gruppen stehen
 * zusammenhängend.
 *
 * Der Zeitplan steht unter „Renntag", obwohl er vorher erstellt wird: mit dem Split-Modus
 * (ADR-0086) ist er die Arbeitsfläche des Regattabüros am Renntag.
 */
export const EVENT_SECTIONS: readonly EventSection[] = [
    section('general', null, HomeOutlined),
    section('competitions', 'preparation', EmojiEventsOutlined),
    section('settings', 'preparation', SettingsOutlined),
    section('registrations', 'registration', AssignmentOutlined),
    section('participants', 'registration', PeopleOutlined),
    section('invoices', 'registration', ReceiptLongOutlined),
    section('schedule', 'raceDay', CalendarMonthOutlined),
    section('betrieb', 'raceDay', PlayCircleOutlined),
    section('organization', 'raceDay', GroupsOutlined),
    section('results', 'followUp', WorkspacePremiumOutlined),
]

/** Der Bereich, auf den alles zurückfällt; er ist für jede Person sichtbar. */
export const DEFAULT_EVENT_SECTION: EventSectionKey = 'general'

export const isEventSectionKey = (value: unknown): value is EventSectionKey =>
    typeof value === 'string' && (EVENT_SECTION_KEYS as readonly string[]).includes(value)

/**
 * Was die Sichtbarkeitsregeln über die Person wissen müssen. Der Benutzerkontext (`useUser()`)
 * erfüllt diesen Typ direkt, angemeldet wie anonym: `visibleEventSections(user)`.
 */
export type EventSectionAccess = {
    checkPrivilege: (privilege: Privilege) => boolean
    getPrivilegeScope: (action: Action, resource: Resource) => Scope | undefined
}

/**
 * Die Bereiche, die eine Person sieht, in Anzeigereihenfolge. Die Regeln sind die der früheren
 * Reiterleiste (EventPage, Stand 13.11.2026) — niemand sieht mehr als vorher, niemandem fehlt
 * etwas:
 * - Übersicht, Wettkämpfe & Tage: alle, auch anonym.
 * - Teilnehmende: Meldungen lesen (GLOBAL oder OWN).
 * - Meldungen, Zeitplan, Einstellungen: Veranstaltung lesen (GLOBAL).
 * - Team & Helfer: Veranstaltung UND Benutzer:innen lesen (GLOBAL).
 * - Betrieb: sobald mindestens eine Kachel sichtbar wäre (`visibleBetriebTiles`, ADR-0093).
 * - Rechnungen: irgendein Leserecht auf Rechnungen (OWN oder GLOBAL) oder Rechnungen erstellen.
 * - Ergebnisse & Urkunden (neu): alle — der Sprung zur öffentlichen Ergebnisseite stand bisher
 *   ungeprüft auf der Übersicht; die übrigen Knöpfe prüfen ihre Rechte im Bereich selbst.
 *
 * Die Regeln hängen nur an Privilegien, nicht an der Veranstaltung: auch bei einer
 * Challenge-Veranstaltung erscheinen dieselben Bereiche (wie bisher die Reiter).
 */
export function visibleEventSections(access: EventSectionAccess): EventSection[] {
    const can = access.checkPrivilege
    const readEvent = can(readEventGlobal)
    const visible: Record<EventSectionKey, boolean> = {
        general: true,
        competitions: true,
        settings: readEvent,
        registrations: readEvent,
        participants: can(readRegistrationGlobal) || can(readRegistrationOwn),
        invoices:
            access.getPrivilegeScope('READ', 'INVOICE') !== undefined || can(createInvoiceGlobal),
        schedule: readEvent,
        betrieb: visibleBetriebTiles(can).length > 0,
        organization: readEvent && can(readUserGlobal),
        results: true,
    }
    return EVENT_SECTIONS.filter(s => visible[s.key])
}

/**
 * Der Bereich, der tatsächlich gezeigt wird: der angefragte, wenn er bekannt und sichtbar ist,
 * sonst der erste sichtbare (die Übersicht). Fängt Tippfehler, alte Lesezeichen und geteilte
 * Links auf Bereiche ab, die die Person nicht sehen darf — statt eines leeren Panels oder einer
 * Reihe von 403-Meldungen.
 */
export function resolveEventTab(
    requested: unknown,
    visible: readonly EventSection[],
): EventSectionKey {
    if (isEventSectionKey(requested) && visible.some(s => s.key === requested)) {
        return requested
    }
    return visible[0]?.key ?? DEFAULT_EVENT_SECTION
}

export type EventSectionGroupBlock = {
    group: EventSectionGroup | null
    /** `null` für den Block ohne Überschrift (die Übersicht). */
    labelKey: (typeof EVENT_SECTION_GROUP_LABEL_KEYS)[EventSectionGroup] | null
    sections: EventSection[]
}

/** Ab wie vielen sichtbaren Bereichen Gruppenüberschriften erscheinen (mehr als fünf). */
export const EVENT_SECTION_GROUP_HEADING_THRESHOLD = 5

/**
 * Gruppenüberschriften lohnen erst bei vielen Bereichen; ein Vereinsvertreter mit fünf
 * Bereichen bekommt eine schlichte Liste.
 */
export const showEventSectionGroupHeadings = (visible: readonly EventSection[]): boolean =>
    visible.length > EVENT_SECTION_GROUP_HEADING_THRESHOLD

/**
 * Teilt die sichtbaren Bereiche in Blöcke je Gruppe (Reihenfolge wie `EVENT_SECTIONS`, leere
 * Gruppen fallen weg). Seitenleiste und Bereichsauswahl (`ListSubheader`) rendern daraus; ob die
 * Überschriften gezeigt werden, entscheidet `showEventSectionGroupHeadings`.
 */
export function groupEventSections(visible: readonly EventSection[]): EventSectionGroupBlock[] {
    const blocks: EventSectionGroupBlock[] = []
    for (const s of visible) {
        const last = blocks[blocks.length - 1]
        if (last && last.group === s.group) {
            last.sections.push(s)
        } else {
            blocks.push({
                group: s.group,
                labelKey: s.group === null ? null : EVENT_SECTION_GROUP_LABEL_KEYS[s.group],
                sections: [s],
            })
        }
    }
    return blocks
}

/**
 * Unterseiten der Veranstaltung und der Bereich, unter dem sie hängen (erstes Pfadsegment nach
 * `/event/$eventId/`). Nicht aufgeführte Segmente fallen auf die Übersicht.
 */
const SUBPAGE_SECTIONS = new Map<string, EventSectionKey>(
    Object.entries({
        // Wettkampfseite und Tagesseite gehören zu „Wettkämpfe & Tage"
        competition: 'competitions',
        eventDay: 'competitions',
        // Meldung eines Vereins (Verwaltung) und Meldestrecke des Vereins
        registration: 'registrations',
        register: 'registrations',
        // Renntag: Boards, Szenen, Regie, Schiedsrichter-Dashboard, Leitstand/Posten, Szenen-Quelle
        info: 'betrieb',
        streamScenes: 'betrieb',
        streamPanel: 'betrieb',
        liveDashboard: 'betrieb',
        timing: 'betrieb',
        stream: 'betrieb',
    } satisfies Record<string, EventSectionKey>),
)

export type EventRouteSection = {
    eventId: string
    /**
     * Der Bereich laut Adresse — noch NICHT gegen die Sichtbarkeit geprüft. Für die Anzeige
     * immer durch `resolveEventTab(section, visibleEventSections(user))` schicken (Beispiel:
     * ein Verein auf `/register` landet so auf der Übersicht, weil er „Meldungen" nicht sieht).
     */
    section: EventSectionKey
}

const trimSlashes = (s: string) => s.replace(/^\/+|\/+$/g, '')

const tabFromSearch = (search: string | Record<string, unknown> | undefined): unknown => {
    if (search === undefined) return undefined
    if (typeof search === 'string') {
        return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('tab')
    }
    return search.tab
}

/**
 * Welcher Bereich auf einer Adresse aktiv ist: `/event/$eventId?tab=…` ebenso wie jede
 * Unterseite (Wettkampf, Tag, Meldung, Boards, Szenen, Regie, Leitstand …). Außerhalb einer
 * Veranstaltung (`/event`, `/results/event/…`, `/speaker/event/…`) `null`.
 *
 * @param pathname `useLocation().pathname` bzw. `router.state.location.pathname`. Der Router
 *   führt den `basepath` darin mit; deshalb `basepath` übergeben (`router.basepath`), sonst wird
 *   unter einem Unterpfad nichts erkannt.
 * @param search geparste Search (`useLocation().search`) oder der rohe Query-String
 *   (`location.searchStr`, mit oder ohne `?`). Nur `tab` wird gelesen, und nur auf der
 *   Veranstaltungsseite selbst.
 */
export function sectionForRoute(
    pathname: string,
    search?: string | Record<string, unknown>,
    basepath: string = '/',
): EventRouteSection | null {
    const base = trimSlashes(basepath)
    let path = trimSlashes(pathname)
    if (base !== '') {
        if (path === base) path = ''
        else if (path.startsWith(base + '/')) path = path.slice(base.length + 1)
        else return null
    }
    const segments = path.split('/').filter(s => s !== '')
    if (segments[0] !== 'event' || segments.length < 2) return null
    const eventId = decodeURIComponent(segments[1])
    const sub = segments[2]
    if (sub === undefined) {
        const tab = tabFromSearch(search)
        return {eventId, section: isEventSectionKey(tab) ? tab : DEFAULT_EVENT_SECTION}
    }
    return {
        eventId,
        section: SUBPAGE_SECTIONS.get(sub) ?? DEFAULT_EVENT_SECTION,
    }
}

/**
 * Validierung der Search auf `/event/$eventId`: unbekannte `tab`-Werte werden verworfen (die
 * Sichtbarkeit prüft erst `resolveEventTab`, weil die Route die Rechte nicht kennt). Für
 * `eventIndexRoute.validateSearch`.
 */
export const validateEventSearch = (search: Record<string, unknown>): {tab?: EventSectionKey} => ({
    tab: isEventSectionKey(search.tab) ? search.tab : undefined,
})
