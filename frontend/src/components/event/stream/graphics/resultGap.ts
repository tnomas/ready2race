/**
 * Rückstand zum Sieger im Ergebnis-Band — rein aus den fertig formatierten Ergebniszeiten
 * berechnet, weil der Server dem Endergebnis anders als den Zwischenzeiten (die `lapMillis`
 * tragen) keine rohen Millisekunden mitgibt. Backend-Format (`Timecode.toString`) ist immer
 * `[[h:]m:]s[.d[d[d]]]` mit einem PUNKT als Dezimaltrennzeichen, unabhängig von der
 * Oberflächensprache — die Umrechnung ins Sprachformat passiert erst beim Formatieren hier.
 *
 * Lässt sich eine Zeile nicht sauber parsen (DNF/DSQ-Text, unerwartetes Format), bleibt der
 * Rückstand leer statt eine falsche Zahl zu zeigen — dieselbe Konvention wie `lastLaps`.
 */
export const parseResultTimeMillis = (timeString: string): number | null => {
    const trimmed = timeString.trim()
    if (trimmed === '') return null

    const segments = trimmed.split(':')
    if (segments.length > 3) return null

    const last = segments[segments.length - 1]
    const [secText, fracText, ...tooMany] = last.split('.')
    if (tooMany.length > 0) return null
    if (!/^\d+$/.test(secText)) return null
    if (fracText !== undefined && !/^\d+$/.test(fracText)) return null

    const headSegments = segments.slice(0, -1)
    if (headSegments.some(segment => !/^\d+$/.test(segment))) return null

    const seconds = Number(secText)
    const fracMillis = fracText ? Number(fracText.padEnd(3, '0').slice(0, 3)) : 0
    const minutes = headSegments.length >= 1 ? Number(headSegments[headSegments.length - 1]) : 0
    const hours = headSegments.length >= 2 ? Number(headSegments[headSegments.length - 2]) : 0

    return ((hours * 60 + minutes) * 60 + seconds) * 1000 + fracMillis
}

/**
 * Rückstand in Millisekunden als „+m:ss,cc" (führende Stunden-/Minutenblöcke entfallen, wenn
 * sie null sind — wie im Zeit-Format selbst). `null` ohne jeden Rückstand (Sieger, totes
 * Rennen) oder bei einem negativen Wert — der käme nur durch einen Parse-Fehler zustande, nie
 * durch ein echtes Ergebnis, und soll dann lieber leer bleiben als falsch aussehen.
 */
export const formatGapMillis = (gapMillis: number, decimalPoint = ','): string | null => {
    if (gapMillis <= 0) return null
    const totalMillis = Math.round(gapMillis)
    const hours = Math.floor(totalMillis / 3_600_000)
    const minutes = Math.floor((totalMillis % 3_600_000) / 60_000)
    const seconds = Math.floor((totalMillis % 60_000) / 1000)
    const hundredths = Math.floor((totalMillis % 1000) / 10)
    const pad = (value: number) => `${value}`.padStart(2, '0')
    const secondsPart = `${pad(seconds)}${decimalPoint}${pad(hundredths)}`
    if (hours > 0) return `+${hours}:${pad(minutes)}:${secondsPart}`
    if (minutes > 0) return `+${minutes}:${secondsPart}`
    return `+${seconds}${decimalPoint}${pad(hundredths)}`
}

/**
 * Rückstand einer Bootszeile zum Sieger — `null`, solange sich eine der beiden Zeiten nicht
 * sauber parsen lässt, das Boot selbst der Sieger ist, oder eine der Zeiten fehlt (kein
 * Ergebnis, DNF/DSQ).
 */
export const winnerGap = (
    teamTimeString: string | null | undefined,
    winnerTimeString: string | null | undefined,
    decimalPoint = ',',
): string | null => {
    if (!teamTimeString || !winnerTimeString) return null
    const teamMillis = parseResultTimeMillis(teamTimeString)
    const winnerMillis = parseResultTimeMillis(winnerTimeString)
    if (teamMillis === null || winnerMillis === null) return null
    return formatGapMillis(teamMillis - winnerMillis, decimalPoint)
}
