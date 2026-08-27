/**
 * Ab dieser Stille seit dem letzten Push warnt das Panel — bewusst EIGENSTÄNDIG neben
 * `STREAM_STALE_AFTER_MS` (15 s, die Bühnenschwelle aus Task 9, siehe `streamStale.ts`): Die
 * Bühne muss so früh wie möglich auf „veraltet" umschalten, um keine unbestätigte Einblendung
 * zu riskieren (`allowsNewlyVisible`). Das Panel dagegen ist ein Beobachtungswerkzeug für
 * Menschen — eine Warnung nach jedem 15-Sekunden-Ruckler wäre ein Fehlalarm. 30 s laut
 * Aufgabenbeschreibung.
 */
export const STREAM_PANEL_STALE_WARNING_MS = 30_000

/** Sekunden seit dem letzten Push, abgerundet — `null` vor dem allerersten Rahmen. */
export const secondsSincePush = (lastReceivedAt: number | null, now: number): number | null =>
    lastReceivedAt === null ? null : Math.max(0, Math.floor((now - lastReceivedAt) / 1000))

/**
 * Ob das Warnbanner stehen soll. `null` (noch nie ein Rahmen angekommen) gilt NICHT als
 * veraltet — das ist der Ladezustand vor dem ersten Stand, keine Störung eines vorher
 * laufenden Betriebs (dieselbe Abwägung wie bei `isStreamStale`).
 */
export const isPanelStale = (lastReceivedAt: number | null, now: number): boolean =>
    lastReceivedAt !== null && now - lastReceivedAt >= STREAM_PANEL_STALE_WARNING_MS
