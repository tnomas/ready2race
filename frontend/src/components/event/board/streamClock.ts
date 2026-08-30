import {AthleteBoardMatch} from '@api/types.gen.ts'
import {parseResultTimeMillis} from '../stream/graphics/resultGap.ts'

/**
 * Zustand der Laufuhr im Stream-Overlay. `hidden` ohne laufenden Lauf oder ohne
 * gestempelten Start, `countdown` zählt auf den Feuerzeitpunkt der Startsequenz HERUNTER
 * (noch kein gestempelter Start — siehe `sequenceFiresAt`-Parameter unten), `running`
 * tickt, `frozen` steht auf dem letzten berechneten Wert.
 *
 * `countdown` trägt `remainingMs`, nicht `elapsedMs` wie die beiden anderen laufenden
 * Phasen — es ist die Zeit BIS zu einem Zeitpunkt, keine Zeit SEIT einem Zeitpunkt, ein
 * eigener Feldname beugt der Verwechslung vor, die genau diesen Fehler erst verursacht hat.
 */
export type StreamClockState =
    | {phase: 'hidden'}
    | {phase: 'countdown'; remainingMs: number}
    | {phase: 'running'; elapsedMs: number}
    | {phase: 'frozen'; elapsedMs: number}

/**
 * Reine Zustandsfunktion der Laufuhr: actualStartTime + Serverzeitversatz -> Phase.
 * clockOffsetMs = clientNow - serverTime (beim Eintreffen der Antwort gemessen); die
 * server-korrigierte "jetzt"-Zeit ist also clientNowMs - clockOffsetMs.
 *
 * frozen, sobald alle Boote timeString tragen oder failed sind (und mind. eines
 * existiert) — elapsedMs ist dann die GRÖSSTE gewertete Bootszeit (geparst aus den
 * timeStrings, siehe Kommentar im Code), nicht die seit dem Start verstrichene Zeit:
 * die Uhr soll exakt auf der Zahl stehen bleiben, mit der das letzte Boot im Einlauf
 * steht. Nur wenn sich keine Zeit parsen lässt, fällt sie auf die verstrichene Zeit
 * zurück — und dieser Rückfall liefe bei weiteren Aufrufen mit fortschreitendem
 * clientNowMs weiter, weil die Funktion rein ist und keine Historie kennt. Wer sie
 * aufruft, hält den ersten frozen-Wert deshalb weiterhin selbst fest.
 *
 * `sequenceStartedAt`/`sequenceFiresAt` (optional, additive Ergänzung für die neue
 * Stream-Bandgrafik CLOCK — die Board-Kachel ruft weiterhin mit genau drei Argumenten
 * auf und verhält sich dadurch unverändert): Ist noch kein Start gestempelt, aber eine
 * laufende Startsequenz bekannt, liefert die Funktion `countdown` mit der bis zum
 * FEUERZEITPUNKT der Sequenz verbleibenden Zeit (auf 0 geklemmt, sowohl falls der
 * Feuerzeitpunkt laut server-korrigierter Uhr noch nicht erreicht… als auch falls er
 * bereits VERSTRICHEN ist — eine pausierte oder verzögerte Sequenz darf hier nie in
 * positive Zahlen laufen, das würde eine tickende Uhr für einen Lauf zeigen, der noch
 * gar nicht gestartet ist). Ein gestempelter Start (`actualStartTime`) hat IMMER
 * Vorrang und schaltet unabhängig von beiden Sequenz-Feldern auf `running`/`frozen`.
 *
 * Eine frühere Fassung zeigte hier ersatzweise die seit `sequenceStartedAt` verstrichene
 * Zeit mit einem Minus davor — das zählte sichtbar in die FALSCHE Richtung (weiter weg
 * von 0 statt darauf zu). Fehlt der Feuerzeitpunkt (`sequenceFiresAt`), während eine
 * Sequenz läuft, zeigt die Bühne jetzt lieber GAR KEINE Uhr als eine mit vertauschtem
 * Vorzeichen.
 */
export const streamClockState = (
    match: AthleteBoardMatch | null,
    clientNowMs: number,
    clockOffsetMs: number,
    sequenceStartedAt?: string | null,
    sequenceFiresAt?: string | null,
): StreamClockState => {
    if (match === null) {
        return {phase: 'hidden'}
    }

    if (match.actualStartTime == null) {
        if (sequenceStartedAt == null || sequenceFiresAt == null) {
            return {phase: 'hidden'}
        }
        const fireMs = new Date(sequenceFiresAt).getTime()
        const serverNowMs = clientNowMs - clockOffsetMs
        const remainingMs = Math.max(0, fireMs - serverNowMs)
        return {phase: 'countdown', remainingMs}
    }

    const startMs = new Date(match.actualStartTime).getTime()
    const serverNowMs = clientNowMs - clockOffsetMs
    const elapsedMs = Math.max(0, serverNowMs - startMs)

    const allTeamsDone =
        match.teams.length > 0 && match.teams.every(team => team.timeString != null || team.failed)

    if (!allTeamsDone) return {phase: 'running', elapsedMs}

    // Eingefroren wird auf die ZEIT DES LETZTEN ZIELEINLAUFS, nicht auf „jetzt": Zwischen dem
    // letzten Boot im Ziel und dem Poll, der es meldet, vergeht fast immer etwas Zeit — die
    // weiterlaufend eingefrorene Uhr stünde dann z. B. auf 6:07.2, während das letzte Boot
    // sichtbar 6:06.8 gefahren ist. Die größte gewertete Bootszeit IST der Moment, in dem die
    // Uhr für die Zuschauer stoppt (timeString enthält bereits etwaige Strafen — dieselbe Zahl,
    // die auch Einlauf und Ergebnis zeigen). Lässt sich keine Zeit parsen (alle Boote DNF/DSQ,
    // unerwartetes Format), bleibt der bisherige Rechenweg als Rückfall.
    const finishMillis = match.teams
        .map(team => (team.timeString != null ? parseResultTimeMillis(team.timeString) : null))
        .filter((millis): millis is number => millis !== null)
    const frozenMs = finishMillis.length > 0 ? Math.max(...finishMillis) : elapsedMs

    return {phase: 'frozen', elapsedMs: frozenMs}
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
 * (`sequenceFiresAt`) nicht hat. Bei 0 (oder geklemmt negativ) OHNE Vorzeichen — der
 * Moment des Starts selbst ist kein „davor" mehr.
 */
export const formatCountdown = (remainingMs: number): string => {
    const clamped = Math.max(0, remainingMs)
    if (clamped === 0) return '0:00'
    const totalSeconds = Math.floor(clamped / 1000)
    const seconds = totalSeconds % 60
    const minutes = Math.floor(totalSeconds / 60)
    const pad2 = (n: number) => n.toString().padStart(2, '0')
    return `−${minutes}:${pad2(seconds)}`
}
