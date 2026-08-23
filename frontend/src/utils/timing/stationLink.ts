/**
 * Board-Adresse eines Zeitnahme-Postens — EINE Stelle für alle Oberflächen, die den Postennamen
 * als Link auf sein Board führen (Betrieb-Reiter, Leitstand-Übersicht, Zeiten- und Geräte-Reiter).
 * Ein ANZEIGE-Posten leitet die Board-Route selbst auf seine Anzeige weiter, deshalb braucht es
 * hier keine Typ-Unterscheidung.
 */
export function stationBoardPath(eventId: string, stationId: string): string {
    return `/event/${eventId}/timing/${stationId}`
}

/** Absolute Fassung für „in neuem Fenster öffnen" und „Adresse kopieren". */
export function stationBoardUrl(eventId: string, stationId: string): string {
    return `${window.location.origin}${stationBoardPath(eventId, stationId)}`
}
