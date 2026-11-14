/**
 * Runden- und Laufname als eine Zeile, ohne dass der Rundenname doppelt erscheint: Die Rundenanlage
 * nennt Läufe oft schon nach ihrer Runde („Vorlauf 1" in „Vorlauf", „Finale" in „Finale").
 *
 * - Laufname enthält den Rundennamen (oder ist gleich) → nur der Laufname
 * - sonst beides, getrennt durch „ · "; fehlt eines, das andere allein
 */
export const roundMatchLabel = (
    roundName: string | null | undefined,
    matchName: string | null | undefined,
): string => {
    const round = roundName?.trim() ?? ''
    const match = matchName?.trim() ?? ''
    if (!round) return match
    if (!match) return round
    if (match.toLocaleLowerCase().includes(round.toLocaleLowerCase())) return match
    return `${round} · ${match}`
}
