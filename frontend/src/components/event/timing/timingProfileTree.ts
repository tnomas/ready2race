import {TimingProfileCompetitionDto, TimingProfileOptionDto} from '@api/types.gen.ts'

/**
 * Reine Logik des Zeitnahmeprofil-Baums: Beschriftungen, Zähler und der Aufklapp-Zustand. Ohne
 * Netz und Komponenten testbar — die Oberfläche (TimingProfileTree) rendert nur. Die Auflösung
 * „welches Profil gilt hier" steht bewusst NICHT hier: die rechnet der Server, damit es sie genau
 * einmal gibt.
 */

/** Wie ein Profil im Auswahlfeld steht: Name plus Detail in Klammern (Adresse bzw. Startart). */
export const optionLabel = (option: TimingProfileOptionDto): string =>
    option.detail ? `${option.name} (${option.detail})` : option.name

/**
 * Die Beschriftung zu einer Profil-id, oder null. Null auch bei einer unbekannten id: Ein
 * inzwischen gelöschtes Profil darf die Zeile nicht zerlegen, sie zeigt dann „nicht gesetzt".
 */
export const profileLabel = (
    options: TimingProfileOptionDto[],
    profile: string | null | undefined,
): string | null => {
    if (!profile) return null
    const option = options.find(o => o.id === profile)
    return option ? optionLabel(option) : null
}

/**
 * Wie viele Ebenen UNTERHALB dieses Wettkampfs einen eigenen Wert haben. Der Zähler steht an der
 * eingeklappten Zeile und ist die Einladung, sie zu öffnen — der eigene Wert des Wettkampfs
 * zählt nicht mit, der steht ja sichtbar daneben.
 */
export const deviationCount = (competition: TimingProfileCompetitionDto): number =>
    competition.rounds.reduce(
        (sum, round) =>
            sum +
            (round.ownProfile ? 1 : 0) +
            round.matches.filter(match => match.ownProfile).length,
        0,
    )

/**
 * Eine Ebene auf- bzw. zuklappen. Gibt bewusst eine NEUE Menge zurück statt die übergebene zu
 * verändern: React vergleicht den State per Identität und würde eine in place geänderte Menge
 * nicht neu rendern.
 */
export const toggleExpanded = (expanded: Set<string>, id: string): Set<string> => {
    const next = new Set(expanded)
    if (!next.delete(id)) next.add(id)
    return next
}

/**
 * Der Sperr-Lebenszyklus einer Zeile, als reine Logik.
 *
 * Eine Zeile bleibt gesperrt, bis der Baum da ist, der ihren Schreibvorgang enthält — sonst stünde
 * zwischen Erfolgsmeldung und neuem Baum ihr ALTER Wert entsperrt da und lüde zum zweiten Klick
 * ein. Weil mehrere Zeilen gleichzeitig unterwegs sein können (am Renntag hakt jemand zügig
 * mehrere durch), reicht „gesperrt ja/nein" nicht: Jede Zeile merkt sich den STEMPEL des Baums,
 * auf den sie wartet, und eine eintreffende Ladung löst nur die Zeilen, die sie tatsächlich
 * einschließt.
 *
 * Die Stempel sind eine streng steigende Zählung. Eine Ladung mit Stempel `r` wurde angefordert,
 * nachdem der Schreibvorgang mit Stempel `r` durch war — also enthält sie auch alle kleineren.
 */
export type SavingRows = Map<string, number>

/** Stempel einer Zeile, deren Schreibvorgang noch läuft: Kein Baum darf sie lösen. */
export const WRITE_IN_FLIGHT = 0

/** Sperrt eine Zeile für einen beginnenden Schreibvorgang. */
export const lockRow = (rows: SavingRows, key: string): SavingRows =>
    new Map(rows).set(key, WRITE_IN_FLIGHT)

/** Löst eine Zeile sofort — der Weg für einen gescheiterten Schreibvorgang. */
export const unlockRow = (rows: SavingRows, key: string): SavingRows => {
    const next = new Map(rows)
    next.delete(key)
    return next
}

/**
 * Der Schreibvorgang ist durch: Die Zeile bleibt gesperrt und wartet ab jetzt auf den Baum mit
 * diesem Stempel.
 */
export const awaitReload = (rows: SavingRows, key: string, stamp: number): SavingRows =>
    new Map(rows).set(key, stamp)

/**
 * Ein Baum mit dem Stempel `loaded` ist eingetroffen: Er löst genau die Zeilen, deren
 * Schreibvorgang er einschließt (Stempel gesetzt und nicht größer als seiner). Zeilen, die noch
 * schreiben, und solche, die auf eine spätere Ladung warten, bleiben gesperrt.
 *
 * Gibt dieselbe Instanz zurück, wenn nichts zu lösen ist: Sonst löste jeder Abruf einen
 * zusätzlichen Rendervorgang aus.
 */
export const releaseCovered = (rows: SavingRows, loaded: number): SavingRows => {
    const covered = [...rows].filter(([, stamp]) => stamp !== WRITE_IN_FLIGHT && stamp <= loaded)
    if (covered.length === 0) return rows
    const next = new Map(rows)
    for (const [key] of covered) next.delete(key)
    return next
}
