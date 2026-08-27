import {AthleteBoardMatch} from '@api/types.gen.ts'

/**
 * Zustand der Laufuhr im Stream-Overlay. `hidden` ohne laufenden Lauf oder ohne
 * gestempelten Start, `countdown` zählt seit dem Sequenzstart (noch kein gestempelter
 * Start — siehe `sequenceStartedAt`-Parameter unten), `running` tickt, `frozen` steht
 * auf dem letzten berechneten Wert.
 */
export type StreamClockState =
    | {phase: 'hidden'}
    | {phase: 'countdown'; elapsedMs: number}
    | {phase: 'running'; elapsedMs: number}
    | {phase: 'frozen'; elapsedMs: number}

/**
 * Reine Zustandsfunktion der Laufuhr: actualStartTime + Serverzeitversatz -> Phase.
 * clockOffsetMs = clientNow - serverTime (beim Eintreffen der Antwort gemessen); die
 * server-korrigierte "jetzt"-Zeit ist also clientNowMs - clockOffsetMs.
 *
 * frozen, sobald alle Boote timeString tragen oder failed sind (und mind. eines
 * existiert) — elapsedMs wird dafür GENAUSO berechnet wie bei running. Das "Einfrieren"
 * ist kein eigener Rechenweg: die Funktion ist rein und kennt keine Historie. Wer sie
 * aufruft, ist dafür verantwortlich, nach dem Wechsel auf 'frozen' aufzuhören, mit
 * fortschreitendem clientNowMs erneut aufzurufen — sonst würde der "eingefrorene" Wert
 * bei jedem weiteren Aufruf weiterlaufen.
 *
 * `sequenceStartedAt` (optional, additive Ergänzung für die neue Stream-Bandgrafik
 * CLOCK — die Board-Kachel ruft weiterhin mit genau drei Argumenten auf und verhält
 * sich dadurch unverändert): Ist noch kein Start gestempelt, aber eine laufende
 * Startsequenz bekannt, liefert die Funktion `countdown` mit der seit Sequenzstart
 * vergangenen Zeit (auf 0 geklemmt, falls der Sequenzstart laut server-korrigierter
 * Uhr noch in der Zukunft läge — Uhrenversatz/Rundungsrand). Diese Zeit wird NEGATIV
 * dargestellt (siehe `formatCountdown`): sie zählt nicht auf einen bekannten
 * Startzeitpunkt herunter (der steht ja noch nicht fest), sondern zeigt „so lange
 * warten wir schon" als Vorzeichen der Vor-Start-Phase. Ein gestempelter Start hat
 * IMMER Vorrang vor `sequenceStartedAt`.
 */
export const streamClockState = (
    match: AthleteBoardMatch | null,
    clientNowMs: number,
    clockOffsetMs: number,
    sequenceStartedAt?: string | null,
): StreamClockState => {
    if (match === null) {
        return {phase: 'hidden'}
    }

    if (match.actualStartTime == null) {
        if (sequenceStartedAt == null) {
            return {phase: 'hidden'}
        }
        const sequenceStartMs = new Date(sequenceStartedAt).getTime()
        const serverNowMs = clientNowMs - clockOffsetMs
        const elapsedMs = Math.max(0, serverNowMs - sequenceStartMs)
        return {phase: 'countdown', elapsedMs}
    }

    const startMs = new Date(match.actualStartTime).getTime()
    const serverNowMs = clientNowMs - clockOffsetMs
    const elapsedMs = Math.max(0, serverNowMs - startMs)

    const allTeamsDone =
        match.teams.length > 0 && match.teams.every(team => team.timeString != null || team.failed)

    return allTeamsDone ? {phase: 'frozen', elapsedMs} : {phase: 'running', elapsedMs}
}

/** 'm:ss.z' bzw. ab einer Stunde 'h:mm:ss.z' - Zehntel, Tabellenziffern-tauglich. */
export const formatElapsed = (elapsedMs: number): string => {
    const clamped = Math.max(0, elapsedMs)
    const totalTenths = Math.floor(clamped / 100)
    const tenths = totalTenths % 10
    const totalSeconds = Math.floor(totalTenths / 10)
    const seconds = totalSeconds % 60
    const totalMinutes = Math.floor(totalSeconds / 60)
    const minutes = totalMinutes % 60
    const hours = Math.floor(totalMinutes / 60)
    const pad2 = (n: number) => n.toString().padStart(2, '0')

    return hours > 0
        ? `${hours}:${pad2(minutes)}:${pad2(seconds)}.${tenths}`
        : `${minutes}:${pad2(seconds)}.${tenths}`
}

/**
 * '−m:ss' für die Countdown-Phase der Stream-Bandgrafik CLOCK (Vorzeichen: echtes
 * Minuszeichen U+2212, kein Bindestrich — Typografie der Uhr). Keine Zehntel, anders
 * als `formatElapsed`: Die Sekunde reicht für eine Wartezeit vor dem Start, und ein
 * 100-ms-Ticken vor dem Komma suggerierte eine Präzision, die der einzige Anker
 * (`sequenceStartedAt`) nicht hat. Bei 0 (oder geklemmt negativ) OHNE Vorzeichen — der
 * Moment des Sequenzstarts selbst ist kein „davor" mehr.
 */
export const formatCountdown = (elapsedMs: number): string => {
    const clamped = Math.max(0, elapsedMs)
    if (clamped === 0) return '0:00'
    const totalSeconds = Math.floor(clamped / 1000)
    const seconds = totalSeconds % 60
    const minutes = Math.floor(totalSeconds / 60)
    const pad2 = (n: number) => n.toString().padStart(2, '0')
    return `−${minutes}:${pad2(seconds)}`
}
