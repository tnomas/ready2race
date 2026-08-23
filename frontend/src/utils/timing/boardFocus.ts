import {TimingMatchDto} from '@api/types.gen.ts'

/**
 * Reine Fokus-Logik des Zielpostens: welche Partie die Tasten treffen, wohin der Fokus nach
 * Fertigstellung vorrückt und wie Tab durch die laufenden Partien wandert. Herausgezogen wie
 * `matchBoard.ts`, damit sie ohne DOM testbar bleibt.
 */

export type FinishKeyTarget = {
    teamId: string
    /** An diesem Lauf bereits im Ziel — die Taste verpufft dann (kein Doppelstempel). */
    finished: boolean
}

/**
 * Ziffern 1–6 und Buchstaben A–F gleichwertig auf die Boote der fokussierten Partie abbilden:
 * Taste n (bzw. der n-te Buchstabe) trifft das Boot an Position n **nach Startnummer** — nicht die
 * Startnummer selbst, denn die wiederholt sich über Wettkämpfe und kann Lücken haben, während die
 * Position in der Partie für den Bediener direkt ablesbar ist (die Knöpfe tragen die Hinweise).
 */
export function finishKeyTarget(
    match: TimingMatchDto | undefined,
    key: string,
): FinishKeyTarget | undefined {
    if (match === undefined || key.length !== 1) return undefined

    let position: number
    if (key >= '1' && key <= '6') {
        position = key.charCodeAt(0) - '1'.charCodeAt(0)
    } else {
        const upper = key.toUpperCase()
        if (upper >= 'A' && upper <= 'F') {
            position = upper.charCodeAt(0) - 'A'.charCodeAt(0)
        } else {
            return undefined
        }
    }

    const team = [...match.teams].sort((a, b) => a.startNumber - b.startNumber)[position]
    if (team === undefined) return undefined
    return {teamId: team.competitionMatchTeam, finished: team.finished}
}

/**
 * Fokus-Vorauswahl des Zielpostens — das Gegenstück zu `resolveStartSelection` am Start: die von
 * Hand fokussierte Partie bleibt fokussiert, solange sie auf dem Wasser ist (STARTED/STARTING);
 * sonst die erste Partie auf dem Wasser in gelieferter Reihenfolge. Das ist zugleich das
 * „Vorrücken“: läuft die fokussierte Partie ins Ziel (FINISHED), fällt sie aus der Auswahl und der
 * Fokus springt auf die nächste laufende. Ohne laufende Partie treffen die Tasten nichts
 * (undefined).
 */
export function resolveFinishFocus(
    matches: TimingMatchDto[],
    selectedId: string | undefined,
): string | undefined {
    const onWater = (match: TimingMatchDto) =>
        match.progress === 'STARTED' || match.progress === 'STARTING'
    const selected = matches.find(
        match => match.competitionSetupMatch === selectedId && onWater(match),
    )
    if (selected !== undefined) return selected.competitionSetupMatch
    return matches.find(onWater)?.competitionSetupMatch
}

/**
 * Tab-Wanderung durch die fokussierbaren Partien: vorwärts/rückwärts mit Umbruch. Ein unbekannter
 * (oder fehlender) Fokus landet am ersten Eintrag statt irgendwo — das ist der Zustand direkt nach
 * einem Partiewechsel, und der erste Eintrag ist die vorderste laufende Partie.
 */
export function cycleFocus(
    ids: string[],
    currentId: string | undefined,
    delta: 1 | -1,
): string | undefined {
    if (ids.length === 0) return undefined
    const index = currentId === undefined ? -1 : ids.indexOf(currentId)
    if (index === -1) return ids[0]
    return ids[(index + delta + ids.length) % ids.length]
}
