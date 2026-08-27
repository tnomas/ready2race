/**
 * Den 422-Grund des Servers herausziehen, wenn vorhanden (z. B. "chromaColor must be a hex
 * color when background is CHROMA", "PlacementNotAllowed(...)") — Muster aus
 * `BoardsPanel.showSaveError`. Der generierte Fehlertyp kennt `details` nicht, deshalb die
 * Prüfung über unknown.
 */
export const extractErrorReason = (error: unknown): string | undefined => {
    const details = (error as {details?: unknown} | undefined)?.details
    if (
        details !== null &&
        typeof details === 'object' &&
        details !== undefined &&
        'reason' in details &&
        typeof (details as {reason?: unknown}).reason === 'string'
    ) {
        return (details as {reason: string}).reason
    }
    return undefined
}
