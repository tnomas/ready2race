/** Angehakt heißt: Der Posten steht auf dieser Strecke. Der Wert ist der Meter als Rohtext. */
export type StationMeters = Record<string, string>

export type StationAssignmentEntry = [stationId: string, meters: string]

/**
 * Trennt die geladenen Zuordnungen in die, zu denen eine Zeile auf dem Bildschirm gehört, und die
 * verwaisten: Der Posten wurde inzwischen gelöscht oder zum Anzeige-Posten gemacht, seine
 * Zuordnung liegt aber noch am Wettkampf. Nur die sichtbaren gehen in Warnungen und Speichern
 * ein - eine unsichtbare Doppelung beim Meter oder ein unsichtbarer fehlender Meter wäre nicht
 * zu beheben, weil es nichts zum Anklicken gibt.
 */
export const splitStationAssignments = (
    meters: StationMeters,
    visibleStationIds: Iterable<string>,
): {visible: StationAssignmentEntry[]; orphaned: StationAssignmentEntry[]} => {
    const visibleIds = new Set(visibleStationIds)
    const visible: StationAssignmentEntry[] = []
    const orphaned: StationAssignmentEntry[] = []
    Object.entries(meters).forEach(entry => {
        ;(visibleIds.has(entry[0]) ? visible : orphaned).push(entry)
    })
    return {visible, orphaned}
}
