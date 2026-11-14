import {
    NamedParticipantWithRequirementsDto,
    ParticipantRequirementForEventDto,
} from '@api/types.gen.ts'

/**
 * Ein Ziel des manuellen Abgleichs: eine Bedingung, bei rollengebundenen Bedingungen zusammen
 * mit der Rolle. Früher war jedes Ziel ein eigener Menüeintrag am Aktionsknopf der
 * Teilnehmenden-Tabelle; jetzt wird es im Dialog als erstes Feld gewählt.
 */
export type RequirementCheckTarget = {
    /** Eindeutig je Ziel: Bedingung, bei Rollenbindung Bedingung und Rolle. */
    key: string
    requirementId: string
    requirementName: string
    isGlobal: boolean
    namedParticipantId?: string
    namedParticipantName?: string
    /** Die Geltung steht an der Bedingung selbst, nicht an der Rollenzuordnung. */
    perEventDay?: boolean
    perCompetition?: boolean
}

/**
 * Die wählbaren Ziele in Anzeigereihenfolge: erst die Bedingungen ohne Rollenbindung (in der
 * Reihenfolge der Bedingungsliste), dann je Rolle ihre Bedingungen. Eine Bedingung, die an
 * irgendeiner Rolle hängt, erscheint nur rollengebunden – dieselbe Regel wie in der Spalte
 * „Überprüfte Bedingungen".
 */
export function requirementCheckTargets(
    requirements: readonly ParticipantRequirementForEventDto[],
    namedParticipants: readonly NamedParticipantWithRequirementsDto[],
): RequirementCheckTarget[] {
    const namedRequirementIds = new Set(
        namedParticipants.flatMap(np => np.requirements.map(r => r.requirementId)),
    )

    const globalTargets: RequirementCheckTarget[] = requirements
        .filter(r => !namedRequirementIds.has(r.id))
        .map(r => ({
            key: r.id,
            requirementId: r.id,
            requirementName: r.name,
            isGlobal: true,
            perEventDay: r.perEventDay,
            perCompetition: r.perCompetition,
        }))

    const namedTargets: RequirementCheckTarget[] = namedParticipants.flatMap(np =>
        np.requirements.map(req => {
            const requirement = requirements.find(r => r.id === req.requirementId)
            return {
                key: `${req.requirementId}:${np.id}`,
                requirementId: req.requirementId,
                requirementName: req.requirementName,
                isGlobal: false,
                namedParticipantId: np.id,
                namedParticipantName: np.name,
                perEventDay: requirement?.perEventDay,
                perCompetition: requirement?.perCompetition,
            }
        }),
    )

    return [...globalTargets, ...namedTargets]
}

/** Beschriftung eines Ziels in der Auswahl: „Bedingung" bzw. „Bedingung (Rolle)". */
export const requirementCheckTargetLabel = (target: RequirementCheckTarget): string =>
    target.namedParticipantName
        ? `${target.requirementName} (${target.namedParticipantName})`
        : target.requirementName

/**
 * Das aktive Ziel: das gewählte, solange es noch existiert; ohne Wahl genau dann das einzige,
 * wenn es nur eines gibt (dann gibt es nichts zu wählen).
 */
export function resolveSelectedTarget<T extends {key: string}>(
    targets: readonly T[],
    selectedKey: string | null,
): T | undefined {
    if (selectedKey !== null) {
        const selected = targets.find(t => t.key === selectedKey)
        if (selected) return selected
    }
    return targets.length === 1 ? targets[0] : undefined
}
