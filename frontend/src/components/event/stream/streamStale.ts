/**
 * Wie die Bühne mit einem stehenden Kanal umgeht.
 *
 * „nichts Falsches einblenden ist wichtiger als irgendetwas einblenden" (Planungsentscheidung):
 * Eine Bühne ohne frischen Rahmen soll NICHT auf Schwarz/leer springen — der zuletzt bekannte
 * Stand bleibt einfach im React-Zustand stehen, dafür ist hier nichts zu tun. Was hier steht, ist
 * die andere Hälfte: erkennen, DASS der Kanal steht (`isStreamStale`), und verhindern, dass eine
 * Bühne von sich aus eine bislang unsichtbare Grafik neu einblendet, während sie das nicht mehr
 * vom Server bestätigt bekommt (`allowsNewlyVisible`) — gedacht für später lokal weiterlaufende
 * Zustände (etwa ein zwischen zwei Pushes lokal weiterzählender Countdown), die sonst ohne jede
 * neue Nachricht eine neue Einblendung auslösen könnten.
 */

/**
 * Nach dieser Stille seit dem letzten Rahmen gilt die Bühne als veraltet — mindestens
 * 2 × Server-Herzschlag (20 s, `StreamSceneBroadcaster.heartbeatLoop`): ein einzelner
 * verspäteter Herzschlag ist Alltag und darf keine Einblendung sperren, erst zwei
 * ausgebliebene sind ein Zeichen für einen stehenden Kanal.
 */
export const STREAM_STALE_AFTER_MS = 45_000

/**
 * Ob die Bühne veraltet ist. `null` (noch nie ein Rahmen angekommen) gilt NICHT als veraltet —
 * das ist der Ladezustand vor dem ersten Stand, keine Störung eines vorher laufenden Betriebs.
 */
export const isStreamStale = (lastReceivedAt: number | null, now: number): boolean =>
    lastReceivedAt !== null && now - lastReceivedAt >= STREAM_STALE_AFTER_MS

/**
 * Ob eine Grafik neu sichtbar werden darf. Eine bereits sichtbare Grafik bleibt davon
 * unberührt — sie war laut letztem gesicherten Stand schon da und bleibt einfach stehen. Eine
 * bisher unsichtbare Grafik darf nur NEU sichtbar werden, solange die Bühne frisch ist; während
 * einer Störung wäre das eine Einblendung, die der Server nie bestätigt hat.
 */
export const allowsNewlyVisible = (stale: boolean, wasVisible: boolean): boolean =>
    wasVisible || !stale
