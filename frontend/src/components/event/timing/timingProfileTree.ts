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
