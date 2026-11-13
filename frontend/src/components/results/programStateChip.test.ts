import {describe, expect, it} from 'vitest'
import {programStateChip} from './programStateChip.ts'

describe('programStateChip', () => {
    it('zeigt einen gerufenen Lauf wie der Live-Reiter als „In Vorbereitung", nicht als „Läuft"', () => {
        expect(programStateChip('PREPARING', false)?.labelKey).toBe('event.match.status.preparing')
        expect(programStateChip('RUNNING', false)?.labelKey).toBe('results.program.running')
    })

    it('kennt Klärung und „Wartet auf Beenden"', () => {
        expect(programStateChip('CLARIFICATION', false)?.labelKey).toBe(
            'event.match.status.clarification',
        )
        expect(programStateChip('AWAITING_FINISH', false)?.labelKey).toBe(
            'event.match.status.awaitingFinish',
        )
    })

    it('lässt anstehende Programmpunkte ohne Chip, vorbeigezogene nicht', () => {
        expect(programStateChip('UPCOMING', true)).toBeNull()
        expect(programStateChip('FINISHED', true)?.labelKey).toBe('results.program.finished')
        expect(programStateChip('UPCOMING', false)?.labelKey).toBe('results.program.upcoming')
    })
})
