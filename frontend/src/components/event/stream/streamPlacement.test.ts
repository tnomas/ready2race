import {describe, expect, it} from 'vitest'
import {STREAM_PLACEMENTS, STREAM_PLACEMENT_STYLE, STREAM_SLOT_STYLE} from './streamPlacement'

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

    it('verankert SIDE_LEFT/SIDE_RIGHT an einer festen Kopfkante statt vertikal zentriert, damit der wachsende Einlauf-Ticker nicht mit jeder neuen Zeile den ganzen Kasten verschiebt', () => {
        for (const placement of ['SIDE_LEFT', 'SIDE_RIGHT'] as const) {
            expect(STREAM_PLACEMENT_STYLE[placement].top).toBe('16%')
            expect(STREAM_PLACEMENT_STYLE[placement].transform).toBeUndefined()
        }
    })

    it('spannt BOTTOM_CENTER voll auf statt per left:50% + translateX zu zentrieren — die Versatz-Zentrierung ließ noWrap-Inhalt über beide Bühnenränder hinauswachsen', () => {
        expect(STREAM_PLACEMENT_STYLE.BOTTOM_CENTER.left).toBe(0)
        expect(STREAM_PLACEMENT_STYLE.BOTTOM_CENTER.right).toBe(0)
        expect(STREAM_PLACEMENT_STYLE.BOTTOM_CENTER.transform).toBeUndefined()
    })

    it('kappt jeden kantenverankerten Platz auf die Breite des Sicherheitsbereichs', () => {
        for (const placement of ALL_PLACEMENTS) {
            if (placement === 'BOTTOM_CENTER' || placement === 'FULL_CENTER') continue
            expect(STREAM_PLACEMENT_STYLE[placement].maxWidth).toBe('100%')
        }
    })
})

describe('STREAM_SLOT_STYLE', () => {
    it('stapelt jeden Platz per Grid, damit mehrere Grafiken sich überlagern statt zu stapeln', () => {
        for (const placement of ALL_PLACEMENTS) {
            expect(STREAM_SLOT_STYLE[placement].display).toBe('grid')
        }
    })

    it('zentriert den Grid-Inhalt statt ihn zu strecken — sonst würde FULL_CENTER seinen Inhalt auf die volle Fläche dehnen', () => {
        for (const placement of ALL_PLACEMENTS) {
            expect(STREAM_SLOT_STYLE[placement].placeItems).toBe('center')
        }
    })

    it('behält die Anker-Position jedes Platzes aus STREAM_PLACEMENT_STYLE bei', () => {
        for (const placement of ALL_PLACEMENTS) {
            expect(STREAM_SLOT_STYLE[placement].position).toBe(STREAM_PLACEMENT_STYLE[placement].position)
            expect(STREAM_SLOT_STYLE[placement].left).toBe(STREAM_PLACEMENT_STYLE[placement].left)
            expect(STREAM_SLOT_STYLE[placement].right).toBe(STREAM_PLACEMENT_STYLE[placement].right)
            expect(STREAM_SLOT_STYLE[placement].top).toBe(STREAM_PLACEMENT_STYLE[placement].top)
            expect(STREAM_SLOT_STYLE[placement].bottom).toBe(STREAM_PLACEMENT_STYLE[placement].bottom)
            expect(STREAM_SLOT_STYLE[placement].transform).toBe(STREAM_PLACEMENT_STYLE[placement].transform)
        }
    })

    it('lässt STREAM_PLACEMENT_STYLE selbst unverändert (keine Mutation beim Zusammenführen)', () => {
        expect(STREAM_PLACEMENT_STYLE.FULL_CENTER.display).toBe('flex')
    })
})
