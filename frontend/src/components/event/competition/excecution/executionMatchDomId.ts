/**
 * DOM-Id der Lauf-Karte — Ankerpunkt für den Sprung aus dem Zeitplan (Veranstaltungs-Modus):
 * Der Klick auf eine Lauf-Zeile lädt den Wettkampf rechts und scrollt dann zu genau dieser
 * Karte. Dasselbe Prinzip wie die Karten-Ids der „Läufe"-Spalte des Schiedsrichter-Boards.
 */
export const executionMatchDomId = (matchId: string): string => `execution-match-${matchId}`
