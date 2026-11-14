import type {LinkComponentProps} from '@tanstack/react-router'

/**
 * Breadcrumb-Pfade für den Seitenkopf (`PageHeader`, Prop `breadcrumbs`).
 *
 * Regeln (UX-Navigationskonzept, Abschnitt „Seitenkopf, Breadcrumbs, Zurück"):
 * - Der Pfad beginnt beim Bereich der Seitenleiste (Veranstaltungen, Vereine, Benutzer:innen …)
 *   und endet mit der aktuellen Seite. Das letzte Glied ist kein Link (`aria-current="page"`).
 * - Glieder sind echte Links; Bereiche einer Veranstaltung verlinken mit `?tab=`, damit der
 *   Sprung in denselben Bereich führt wie die Seitenleiste.
 * - Namen, die noch laden, erscheinen als „…" statt die Kette springen zu lassen.
 *
 * Reine Funktionen – die Texte reicht der Aufrufer übersetzt herein (`t('navigation.titles.events')`).
 */

/** Link-Ziel eines Glieds: dieselben Props wie ein Router-Link. */
export type CrumbLink = Pick<LinkComponentProps<'a'>, 'to' | 'params' | 'search' | 'hash'>

export type Crumb = {
    label: string
    /** Fehlt beim letzten Glied (aktuelle Seite) bzw. bei Gliedern ohne eigene Seite. */
    link?: CrumbLink
}

/** Ein Glied, wie es gerendert wird: das letzte ist die aktuelle Seite. */
export type RenderedCrumb = Crumb & {current: boolean}

/** Platzhalter für Namen, die noch laden. */
export const PENDING_LABEL = '…'

/** Name eines Objekts als Glied-Text; leer oder noch nicht geladen ⇒ „…". */
export const crumbLabel = (name: string | null | undefined): string => {
    const trimmed = name?.trim()
    return trimmed ? trimmed : PENDING_LABEL
}

/**
 * Bereitet einen Pfad zum Rendern auf: leere Glieder fallen weg, direkt aufeinanderfolgende
 * Doppel (gleicher Text) werden zusammengelegt, und das letzte Glied verliert seinen Link und
 * wird als aktuelle Seite markiert.
 */
export const finalizeTrail = (crumbs: readonly Crumb[]): RenderedCrumb[] => {
    const cleaned: Crumb[] = []
    for (const crumb of crumbs) {
        const label = crumb.label.trim()
        if (!label) continue
        const previous = cleaned[cleaned.length - 1]
        if (previous && previous.label === label && label !== PENDING_LABEL) {
            // Das spätere Glied ist das genauere (z. B. mit ?tab=) – es ersetzt das frühere.
            cleaned[cleaned.length - 1] = {...crumb, label}
            continue
        }
        cleaned.push({...crumb, label})
    }
    return cleaned.map((crumb, index) =>
        index === cleaned.length - 1
            ? {label: crumb.label, current: true}
            : {...crumb, current: false},
    )
}

// ---------------------------------------------------------------------------------------------
// Bausteine für die wiederkehrenden Pfade

/** Bereich einer Veranstaltung (`?tab=`), etwa „Wettkämpfe & Tage" oder „Betrieb". */
export type EventSectionCrumb = {
    /** Wert für `?tab=` auf der Veranstaltungsseite. */
    tab: string
    label: string
}

type EventTrailInput = {
    /** Übersetzter Bereichsname der Seitenleiste, z. B. `t('navigation.titles.events')`. */
    eventsLabel: string
    eventId: string
    eventName: string | null | undefined
    section?: EventSectionCrumb
    /**
     * Weitere Glieder unterhalb des Bereichs; das letzte ist die aktuelle Seite
     * (z. B. Wettkampf „12 JM4x", Tag „Sa., 15.08.2026", Verein einer Meldung).
     */
    trail?: Crumb[]
}

/**
 * `Veranstaltungen › <Veranstaltung> › <Bereich> › …`
 *
 * @example
 * buildEventTrail({
 *     eventsLabel: t('navigation.titles.events'),
 *     eventId, eventName: event?.name,
 *     section: {tab: 'competitions', label: t('event.tabs.competitions')},
 *     trail: [{label: `${competition.identifier} ${competition.shortName}`}],
 * })
 */
export const buildEventTrail = ({
    eventsLabel,
    eventId,
    eventName,
    section,
    trail = [],
}: EventTrailInput): Crumb[] => [
    {label: eventsLabel, link: {to: '/event'}},
    {label: crumbLabel(eventName), link: {to: '/event/$eventId', params: {eventId}}},
    ...(section
        ? [
              {
                  label: section.label,
                  link: {to: '/event/$eventId', params: {eventId}, search: {tab: section.tab}},
              } satisfies Crumb,
          ]
        : []),
    ...trail,
]

/** `Vereine › <Verein> [› …]` */
export const buildClubTrail = ({
    clubsLabel,
    clubId,
    clubName,
    trail = [],
}: {
    clubsLabel: string
    clubId: string
    clubName: string | null | undefined
    trail?: Crumb[]
}): Crumb[] => [
    {label: clubsLabel, link: {to: '/club'}},
    {label: crumbLabel(clubName), link: {to: '/club/$clubId', params: {clubId}}},
    ...trail,
]

/** `Benutzer:innen › <Name> [› …]` */
export const buildUserTrail = ({
    usersLabel,
    userId,
    userName,
    trail = [],
}: {
    usersLabel: string
    userId: string
    userName: string | null | undefined
    trail?: Crumb[]
}): Crumb[] => [
    {label: usersLabel, link: {to: '/user'}},
    {label: crumbLabel(userName), link: {to: '/user/$userId', params: {userId}}},
    ...trail,
]
