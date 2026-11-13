/**
 * Entscheidungen des UserProviders rund um die Sitzung, als reine Funktionen herausgelöst, damit
 * sie ohne Browser und ohne React prüfbar sind.
 */

import {TIMING_DEVICE_TOKEN_HEADER} from '@utils/timing/deviceSession.ts'

export const SESSION_HEADER = 'X-Api-Session'

/**
 * Was die Antwort von `GET /login` für die abgelegte Sitzung bedeutet.
 *
 * - `authenticated`: 200 mit Nutzerangaben.
 * - `anonymous`: Der Server kennt die Sitzung nicht (204 laut OpenAPI, 401 vorsorglich). Nur dann
 *   darf der Token vom Gerät.
 * - `retry`: alles andere, vor allem 5xx (Backend startet neu, nginx liefert 502). Das sagt
 *   nichts über die Sitzung; wer in dieser Minute neu lädt, darf sie nicht verlieren.
 */
export type LoginCheckOutcome = 'authenticated' | 'anonymous' | 'retry'

export const classifyLoginCheck = (status: number, hasData: boolean): LoginCheckOutcome => {
    if (status === 200) return hasData ? 'authenticated' : 'retry'
    if (status === 204 || status === 401) return 'anonymous'
    return 'retry'
}

const RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 30_000]

/**
 * Wartezeit vor dem n-ten erneuten Versuch (0-basiert). Wächst bis 30 s und bleibt dort: Ein
 * unbeaufsichtigter Board- oder OBS-Bildschirm soll sich irgendwann von selbst erholen, ohne den
 * Server während eines Neustarts im Sekundentakt zu befragen.
 */
export const loginRetryDelayMs = (attempt: number): number =>
    RETRY_DELAYS_MS[Math.min(Math.max(attempt, 0), RETRY_DELAYS_MS.length - 1)]

const stripBasepath = (pathname: string, basepath: string): string => {
    const base = basepath.replace(/\/+$/, '')
    if (base !== '' && (pathname === base || pathname.startsWith(`${base}/`))) {
        const rest = pathname.slice(base.length)
        return rest === '' ? '/' : rest
    }
    return pathname
}

/**
 * Anzeige-Routen: fest montierte Bildschirme, OBS-Quellen, Sprecherplatz und Zeitnahme-Geräte.
 * Dort steht niemand, der eine Panikseite wegklickt oder sich neu anmeldet; viele davon laufen
 * per Geräte-Token ohne jede Sitzung. Sie dürfen weder auf die Startseite springen noch auf der
 * Panikseite hängen bleiben.
 *
 * `streamPanel` und `streamScenes` (Regie und Verwaltung) gehören nicht dazu, nur die Bühne
 * `/event/$eventId/stream/$sceneId`.
 */
export const isDisplayPath = (pathname: string, basepath: string = '/'): boolean => {
    const path = stripBasepath(pathname, basepath)
    return (
        /^\/board\//.test(path) ||
        /^\/speaker(\/|$)/.test(path) ||
        /^\/event\/[^/]+\/stream\/[^/]+/.test(path) ||
        /^\/event\/[^/]+\/timing\/[^/]+/.test(path)
    )
}

/** Die beiden Anmeldeseiten; wer dort angemeldet ankommt, gehört weitergeleitet. */
export const isLoginPath = (pathname: string, basepath: string = '/'): boolean => {
    const path = stripBasepath(pathname, basepath).replace(/\/+$/, '')
    return path === '/login' || path === '/app/login'
}

/**
 * Ist eine Antwort der Beleg, dass die eigene Sitzung abgelaufen oder widerrufen ist?
 *
 * Nur ein 401 auf eine Anfrage, die die Sitzung auch getragen hat. Trug sie zusätzlich ein
 * Geräte-Token (Board, Stream-Bühne, Posten), kann der 401 ebenso gut dem Geräte-Token gelten —
 * ein widerrufener Board-Link darf einen angemeldeten Admin nicht abmelden.
 */
export const isSessionRejection = (status: number, requestHeaders: Headers): boolean =>
    status === 401 &&
    requestHeaders.has(SESSION_HEADER) &&
    !requestHeaders.has(TIMING_DEVICE_TOKEN_HEADER)
