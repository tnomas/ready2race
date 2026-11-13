import {
    EventSectionAccess,
    EventSectionGroupBlock,
    EventSectionKey,
    groupEventSections,
    resolveEventTab,
    sectionForRoute,
    showEventSectionGroupHeadings,
    visibleEventSections,
} from '../../pages/event/eventSections.ts'

/** Was der Veranstaltungsblock der Seitenleiste auf einer Adresse zeigt. */
export type EventSidebarModel = {
    eventId: string
    /** Der hervorgehobene Bereich — auf Unterseiten der, unter dem sie hängen. */
    activeSection: EventSectionKey
    blocks: EventSectionGroupBlock[]
    showGroupHeadings: boolean
}

/**
 * Der Veranstaltungsblock der Seitenleiste für eine Adresse, oder `null` außerhalb einer
 * Veranstaltung. Sichtbarkeit, Gruppen und Rückfall kommen aus dem Bereichsmodell
 * (eventSections.ts); hier wird nur zusammengesetzt, damit Seitenleiste und Test dieselbe
 * Rechnung sehen.
 *
 * Aktiv ist der Bereich laut Adresse, geprüft gegen die Sichtbarkeit: Ein unbekannter oder
 * nicht erlaubter `?tab=` hebt die Übersicht hervor — genau den Bereich, den die
 * Veranstaltungsseite dann zeigt.
 */
export function eventSidebarModel(
    pathname: string,
    search: string | Record<string, unknown> | undefined,
    basepath: string,
    access: EventSectionAccess,
): EventSidebarModel | null {
    const route = sectionForRoute(pathname, search, basepath)
    if (route === null) return null
    const visible = visibleEventSections(access)
    return {
        eventId: route.eventId,
        activeSection: resolveEventTab(route.section, visible),
        blocks: groupEventSections(visible),
        showGroupHeadings: showEventSectionGroupHeadings(visible),
    }
}
