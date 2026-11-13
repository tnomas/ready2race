import {describe, expect, it} from 'vitest'
import {
    NamedParticipantWithRequirementsDto,
    ParticipantRequirementForEventDto,
} from '@api/types.gen.ts'
import {
    requirementCheckTargetLabel,
    requirementCheckTargets,
    resolveSelectedTarget,
} from './requirementCheckTargets.ts'

const requirement = (
    id: string,
    name: string,
    scope: {perEventDay?: boolean; perCompetition?: boolean} = {},
): ParticipantRequirementForEventDto => ({
    id,
    name,
    optional: false,
    active: true,
    checkInApp: false,
    publiclyVisible: false,
    perEventDay: scope.perEventDay ?? false,
    perCompetition: scope.perCompetition ?? false,
})

const role = (
    id: string,
    name: string,
    requirements: {id: string; name: string}[],
): NamedParticipantWithRequirementsDto => ({
    id,
    name,
    qrCodeRequired: false,
    requirements: requirements.map(r => ({
        requirementId: r.id,
        requirementName: r.name,
        namedParticipantId: id,
        qrCodeRequired: false,
    })),
})

describe('requirementCheckTargets', () => {
    it('liefert Bedingungen ohne Rollenbindung in Listenreihenfolge mit ihrer Geltung', () => {
        const targets = requirementCheckTargets(
            [requirement('a', 'Arzt'), requirement('w', 'Waage', {perCompetition: true})],
            [],
        )
        expect(targets.map(t => t.key)).toEqual(['a', 'w'])
        expect(targets[1]).toMatchObject({
            requirementId: 'w',
            requirementName: 'Waage',
            isGlobal: true,
            perCompetition: true,
            perEventDay: false,
        })
    })

    it('führt rollengebundene Bedingungen nur je Rolle, nicht zusätzlich ohne Rolle', () => {
        const targets = requirementCheckTargets(
            [requirement('a', 'Arzt'), requirement('w', 'Waage', {perEventDay: true})],
            [
                role('st', 'Steuer', [{id: 'w', name: 'Waage'}]),
                role('ru', 'Ruderer', [{id: 'w', name: 'Waage'}]),
            ],
        )
        expect(targets.map(t => t.key)).toEqual(['a', 'w:st', 'w:ru'])
        expect(targets[1]).toMatchObject({
            isGlobal: false,
            namedParticipantId: 'st',
            namedParticipantName: 'Steuer',
            // Die Geltung kommt von der Bedingung, die Rollenliste trägt sie nicht.
            perEventDay: true,
            perCompetition: false,
        })
    })

    it('liefert ohne Bedingungen keine Ziele', () => {
        expect(requirementCheckTargets([], [])).toEqual([])
    })
})

describe('requirementCheckTargetLabel', () => {
    it('hängt die Rolle in Klammern an', () => {
        const [global, named] = requirementCheckTargets(
            [requirement('a', 'Arzt'), requirement('w', 'Waage')],
            [role('st', 'Steuer', [{id: 'w', name: 'Waage'}])],
        )
        expect(requirementCheckTargetLabel(global)).toBe('Arzt')
        expect(requirementCheckTargetLabel(named)).toBe('Waage (Steuer)')
    })
})

describe('resolveSelectedTarget', () => {
    const targets = [{key: 'a'}, {key: 'b'}]

    it('nimmt das gewählte Ziel', () => {
        expect(resolveSelectedTarget(targets, 'b')).toEqual({key: 'b'})
    })

    it('wählt bei mehreren Zielen ohne Wahl nichts vor', () => {
        expect(resolveSelectedTarget(targets, null)).toBeUndefined()
    })

    it('wählt das einzige Ziel vor', () => {
        expect(resolveSelectedTarget([{key: 'x'}], null)).toEqual({key: 'x'})
    })

    it('verwirft eine Wahl, die es nicht mehr gibt', () => {
        expect(resolveSelectedTarget(targets, 'weg')).toBeUndefined()
        expect(resolveSelectedTarget([{key: 'x'}], 'weg')).toEqual({key: 'x'})
    })
})
