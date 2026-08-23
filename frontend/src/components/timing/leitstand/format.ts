import {TimingPrecision, TimingTeamDto} from '@api/types.gen.ts'

/*
 * Genauigkeits-Grenze der Anzeige (Zeitnahme-Einstellung `precision` der Veranstaltung):
 *
 * - OFFIZIELLE Zeiten — alles, was als Ergebnis an den Lauf geht oder ihm entspricht
 *   (`effectiveMillis` im Leitstand, an den Boards und im Stream) — werden mit
 *   `formatOfficialTime` auf genau die eingestellten Stellen ABGESCHNITTEN angezeigt, damit die
 *   Anzeige mit dem übereinstimmt, was die Übernahme an den Lauf schreibt.
 * - ROHWERTE der Zeitnahme — Zeitmarken (`formatTimeOfDay`), die berechneten/überschriebenen
 *   Arbeitswerte der Leitstand-Tabelle (`formatDuration`) und die Sekunden-Eingaben des
 *   Bearbeiten-Dialogs (`formatSeconds`) — bleiben millisekundenfein: Marken sind Messwerte,
 *   keine offiziellen Zeiten, und der Bediener muss sehen, was wirklich gemessen wurde.
 */

/** Wall-clock time of day at 0.1s precision — the same format the boards use for a captured mark. */
export function formatTimeOfDay(millis: number): string {
    const date = new Date(millis)
    const hh = String(date.getHours()).padStart(2, '0')
    const mm = String(date.getMinutes()).padStart(2, '0')
    const ss = String(date.getSeconds()).padStart(2, '0')
    const tenths = Math.floor(date.getMilliseconds() / 100)
    return `${hh}:${mm}:${ss}.${tenths}`
}

/**
 * A *duration* (not a time of day) at millisecond precision: `m:ss.mmm`, widening to `h:mm:ss.mmm`
 * once an hour is reached. Millisecond precision because that is what the official-time layer stores
 * — this is the RAW-value formatter (computed/override working values); the published result is
 * rendered by `formatOfficialTime` instead. Negative values keep their sign rather than wrapping,
 * so a broken computation stays visible.
 */
export function formatDuration(millis: number): string {
    return formatWithDigits(millis, 3)
}

/** Nachkommastellen je Stufe — SEKUNDE zeigt gar keine, MILLISEKUNDE alle drei. */
const PRECISION_DIGITS: Record<TimingPrecision, number> = {
    SEKUNDE: 0,
    ZEHNTEL: 1,
    HUNDERTSTEL: 2,
    MILLISEKUNDE: 3,
}

/**
 * Schneidet [millis] auf die Stufe ab — dieselbe Semantik wie das Backend beim Schreiben an den
 * Lauf (nie kaufmännisch: die veröffentlichte Zeit ist nie schneller als die gemessene).
 */
export function truncateToPrecision(millis: number, precision: TimingPrecision): number {
    const step = 10 ** (3 - PRECISION_DIGITS[precision])
    return Math.floor(millis / step) * step
}

/**
 * Eine OFFIZIELLE Zeit in der eingestellten Genauigkeit: abgeschnitten und mit genau so vielen
 * Nachkommastellen, wie die Stufe hat (`1:31.5` bei ZEHNTEL, `1:31` bei SEKUNDE). Der Server
 * liefert `effectiveMillis` roh — der Schnitt hier entspricht exakt dem Wert, den die Übernahme
 * an den Lauf schreibt, damit Leitstand/Board und Lauf nie verschiedene Zeiten zeigen.
 */
export function formatOfficialTime(millis: number, precision: TimingPrecision): string {
    return formatWithDigits(truncateToPrecision(millis, precision), PRECISION_DIGITS[precision])
}

/** Gemeinsames Rendering: `m:ss[.d…]`, ab einer Stunde `h:mm:ss[.d…]`. */
function formatWithDigits(millis: number, digits: number): string {
    const sign = millis < 0 ? '-' : ''
    const abs = Math.abs(millis)
    const ms = abs % 1000
    const totalSeconds = Math.floor(abs / 1000)
    const seconds = totalSeconds % 60
    const totalMinutes = Math.floor(totalSeconds / 60)
    const minutes = totalMinutes % 60
    const hours = Math.floor(totalMinutes / 60)
    const msPart =
        digits > 0 ? `.${String(ms).padStart(3, '0').slice(0, digits)}` : ''
    if (hours > 0) {
        return `${sign}${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}${msPart}`
    }
    return `${sign}${minutes}:${String(seconds).padStart(2, '0')}${msPart}`
}

/**
 * Millis as a plain seconds number with at most three decimals and no trailing zeroes (`5`, `5.5`,
 * `12.345`). Used for the edit dialog's inputs, whose unit is seconds — see `parseSecondsToMillis`
 * for the inverse.
 */
export function formatSeconds(millis: number): string {
    const seconds = millis / 1000
    return seconds
        .toFixed(3)
        .replace(/0+$/, '')
        .replace(/\.$/, '')
}

/**
 * Parse a seconds input (`12`, `12.34`, `12,34`) into millis, rounded to the nearest millisecond.
 * Returns `null` for anything that is not a finite non-negative number, so the caller can show a
 * validation error instead of sending garbage; an empty/blank string is `null` too and means
 * "cleared" to every caller here (the override PUT has reset semantics for an absent field).
 */
export function parseSecondsToMillis(input: string): number | null {
    const normalized = input.trim().replace(',', '.')
    if (normalized.length === 0) return null
    const value = Number(normalized)
    if (!Number.isFinite(value) || value < 0) return null
    return Math.round(value * 1000)
}

/** `#12 · Team Name`, falling back through club name and participants to the raw id. */
export function teamLabel(team: TimingTeamDto | undefined, fallbackId: string): string {
    if (team === undefined) return fallbackId.slice(0, 8)
    const bits: string[] = []
    if (team.startNumber !== undefined) bits.push(`#${team.startNumber}`)
    if (team.teamName) bits.push(team.teamName)
    else if (team.clubName) bits.push(team.clubName)
    else if (team.participantNames.length > 0) bits.push(team.participantNames.join(' / '))
    return bits.length > 0 ? bits.join(' · ') : fallbackId.slice(0, 8)
}

/** `Wettkampf · Lauf` for the secondary line of a result row. */
export function teamContextLabel(team: TimingTeamDto | undefined): string {
    if (team === undefined) return ''
    return [team.competitionName, team.matchName].filter((part): part is string => !!part).join(' · ')
}
