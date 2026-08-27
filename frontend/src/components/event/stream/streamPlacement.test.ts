import {describe, expect, it} from 'vitest'
import {STREAM_PLACEMENTS, STREAM_PLACEMENT_STYLE} from './streamPlacement'

const ALL_PLACEMENTS = [
    'BOTTOM_CENTER',
    'BOTTOM_LEFT',
    'BOTTOM_RIGHT',
    'TOP_LEFT',
    'TOP_RIGHT',
    'SIDE_LEFT',
    'SIDE_RIGHT',
    'FULL_CENTER',
] as const

describe('streamPlacement', () => {
    it('kennt jeden der acht Plätze der API genau einmal', () => {
        expect(STREAM_PLACEMENTS.slice().sort()).toEqual(ALL_PLACEMENTS.slice().sort())
    })

    it('verankert jeden Platz absolut, damit er sich nicht mit dem Sicherheitsbereich verschiebt', () => {
        for (const placement of ALL_PLACEMENTS) {
            expect(STREAM_PLACEMENT_STYLE[placement].position).toBe('absolute')
        }
    })
})
