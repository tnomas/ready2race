/**
 * Zonenlose Zeitstempel des Servers.
 *
 * Der Server liefert Wanduhrzeiten (`startTime`, `startedAt`, `finishedAt`, …) als
 * `YYYY-MM-DDTHH:mm:ss[.SSS]` OHNE Zone — es ist die Wanduhr des Servers (Europe/Berlin).
 * `new Date(value)` deutet so einen String als Gerätezeit: richtig, solange das Gerät in derselben
 * Zone steht, und um Stunden daneben, wenn ein Handy auf UTC läuft oder eine Anzeige im Ausland
 * hängt. [parseServerLocalDateTime] deutet den String stattdessen mit dem Zonenversatz des
 * Servers, sobald der bekannt ist.
 *
 * Woher der Versatz kommt: aus einem Paar Wanduhrzeit + Epoch-Millis DESSELBEN Augenblicks
 * ([zoneOffsetFromPair]). `/timing/serverTime` liefert es als `serverLocalTime` neben
 * `serverTimeMillis`; `useServerClock` merkt sich den Versatz bei jeder Probe
 * ([rememberServerZoneOffset]). Bis zur ersten erfolgreichen Probe bleibt [serverZoneOffsetMs]
 * `null`, und alles fällt auf die Gerätezeit zurück — das bisherige Verhalten, nur an einer Stelle.
 */

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/

/**
 * Eine Wanduhrzeit des Servers als Epoch-Millis. Mit bekanntem `serverZoneOffsetMs` (Server-Wanduhr
 * minus UTC) wird sie exakt gedeutet; mit `null` wie bisher als Gerätezeit. Strings mit eigener
 * Zone (`Z`, `+02:00`) brauchen keinen Versatz. Unlesbares ergibt `NaN`, wie `Date.parse`.
 */
export function parseServerLocalDateTime(
    value: string,
    serverZoneOffsetMs: number | null,
): number {
    const match = LOCAL_DATE_TIME.exec(value)
    if (match === null || serverZoneOffsetMs === null) {
        return Date.parse(value)
    }
    const [, year, month, day, hour, minute, second = '0', fraction = '0'] = match
    const millis = Number(fraction.padEnd(3, '0'))
    const asUtc = Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second),
        millis,
    )
    return asUtc - serverZoneOffsetMs
}

/**
 * Der Zonenversatz des Servers (Wanduhr minus UTC) aus einer Wanduhrzeit und den Epoch-Millis
 * desselben Augenblicks; `null`, wenn die Wanduhrzeit unlesbar ist. Auf ganze Minuten gerundet —
 * die beiden Werte stammen aus zwei Feldern derselben Antwort, nicht aus demselben Systemaufruf.
 */
export function zoneOffsetFromPair(wallClock: string, epochMillis: number): number | null {
    const asUtc = parseServerLocalDateTime(wallClock, 0)
    if (Number.isNaN(asUtc)) return null
    const minute = 60_000
    return Math.round((asUtc - epochMillis) / minute) * minute
}

let knownServerZoneOffsetMs: number | null = null

/**
 * Der zuletzt ermittelte Zonenversatz des Servers, `null` solange keiner bekannt ist (siehe
 * Modulkommentar). Alle Anzeigen zonenloser Zeitstempel lesen ihn hier.
 */
export function serverZoneOffsetMs(): number | null {
    return knownServerZoneOffsetMs
}

/**
 * Den Zonenversatz aus einem Paar Wanduhrzeit + Epoch-Millis übernehmen — der Anschlusspunkt für
 * den Tag, an dem ein Endpunkt beides liefert. Unlesbare Paare ändern nichts.
 */
export function rememberServerZoneOffset(wallClock: string, epochMillis: number): void {
    const offset = zoneOffsetFromPair(wallClock, epochMillis)
    if (offset !== null) knownServerZoneOffsetMs = offset
}
