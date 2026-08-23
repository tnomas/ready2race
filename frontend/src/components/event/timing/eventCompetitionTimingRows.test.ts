import {describe, expect, it} from 'vitest'
import {
    competitionWideMode,
    effectiveRowSystem,
    roundDeviationCount,
} from './eventCompetitionTimingRows.ts'
import {TimingModeAssignmentDto} from '@api/types.gen.ts'

const COMPETITION = '11111111-1111-1111-1111-111111111111'
const OTHER_COMPETITION = '22222222-2222-2222-2222-222222222222'
const MODE_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const MODE_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const ROUND = '99999999-9999-9999-9999-999999999999'

const assignment = (
    overrides: Partial<TimingModeAssignmentDto> & {timingMode: string},
): TimingModeAssignmentDto => ({
    id: '00000000-0000-0000-0000-000000000000',
    competition: COMPETITION,
    competitionSetupRound: null,
    ...overrides,
})

describe('effectiveRowSystem', () => {
    it('nimmt das eigene System des Wettkampfs, wenn eines gesetzt ist', () => {
        // Dieselbe Regel wie das Backend (coalesce) und effectiveTimingSystem im Wettkampf-Tab.
        expect(effectiveRowSystem('INTERN', 'RACECLOCKER')).toBe('INTERN')
    })

    it('erbt die Voreinstellung der Veranstaltung, wenn der Wettkampf nichts setzt', () => {
        expect(effectiveRowSystem(null, 'RACECLOCKER')).toBe('RACECLOCKER')
        expect(effectiveRowSystem(undefined, 'WEBSCORER')).toBe('WEBSCORER')
    })

    it('bleibt NONE, wenn weder Wettkampf noch Veranstaltung ein System haben', () => {
        expect(effectiveRowSystem(null, 'NONE')).toBe('NONE')
    })
})

describe('competitionWideMode', () => {
    it('findet die Wettkampf-weite Zuordnung (Eintrag ohne Runde)', () => {
        const assignments = [
            assignment({timingMode: MODE_B, competitionSetupRound: ROUND}),
            assignment({timingMode: MODE_A}),
        ]
        expect(competitionWideMode(assignments, COMPETITION)).toBe(MODE_A)
    })

    it('ignoriert Zuordnungen anderer Wettkämpfe', () => {
        const assignments = [assignment({timingMode: MODE_A, competition: OTHER_COMPETITION})]
        expect(competitionWideMode(assignments, COMPETITION)).toBe('')
    })

    it('liefert leer, wenn nur Runden-Abweichungen existieren', () => {
        // Ein Runden-Eintrag ist KEINE Wettkampf-weite Zuordnung — das Select bleibt leer.
        const assignments = [assignment({timingMode: MODE_A, competitionSetupRound: ROUND})]
        expect(competitionWideMode(assignments, COMPETITION)).toBe('')
    })
})

describe('roundDeviationCount', () => {
    it('zählt nur die Runden-Einträge des Wettkampfs', () => {
        const assignments = [
            assignment({timingMode: MODE_A}),
            assignment({timingMode: MODE_B, competitionSetupRound: ROUND}),
            assignment({
                timingMode: MODE_B,
                competitionSetupRound: ROUND,
                competition: OTHER_COMPETITION,
            }),
        ]
        expect(roundDeviationCount(assignments, COMPETITION)).toBe(1)
    })

    it('liefert 0 ohne Runden-Abweichungen', () => {
        expect(roundDeviationCount([assignment({timingMode: MODE_A})], COMPETITION)).toBe(0)
    })
})
