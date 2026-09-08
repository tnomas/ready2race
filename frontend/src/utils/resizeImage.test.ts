import {describe, expect, test} from 'vitest'
import {targetSize} from './resizeImage'

// Nur targetSize - die reine Rechenfunktion. resizeImage selbst braucht createImageBitmap
// und Canvas, die es in der Node-Testumgebung nicht gibt (Konvention: Tests hier ohne DOM).
describe('targetSize', () => {
    test('verkleinert die lange Kante auf maxEdge, proportional', () => {
        expect(targetSize(3000, 2000, 2000)).toEqual({width: 2000, height: 1334})
    })

    test('verkleinert im Hochformat ebenso proportional', () => {
        expect(targetSize(2000, 3000, 2000)).toEqual({width: 1334, height: 2000})
    })

    test('lässt ein Bild innerhalb von maxEdge unverändert', () => {
        expect(targetSize(800, 600, 2000)).toEqual({width: 800, height: 600})
    })

    test('vergrößert nie - ein kleineres Bild bleibt exakt gleich groß', () => {
        expect(targetSize(100, 50, 2000)).toEqual({width: 100, height: 50})
    })

    test('ein quadratisches Bild an der Grenze bleibt unverändert', () => {
        expect(targetSize(2000, 2000, 2000)).toEqual({width: 2000, height: 2000})
    })

    test('ein quadratisches Bild über der Grenze wird auf maxEdge gestutzt', () => {
        expect(targetSize(4000, 4000, 2000)).toEqual({width: 2000, height: 2000})
    })

    test('151×100 mit maxEdge 100 bleibt bei 100 Pixeln lange Kante', () => {
        expect(targetSize(151, 100, 100)).toEqual({width: 100, height: 67})
    })

    test('2141×1000 mit maxEdge 2000 hat genau 2000 lange Kante', () => {
        expect(targetSize(2141, 1000, 2000)).toEqual({width: 2000, height: 935})
    })
})
