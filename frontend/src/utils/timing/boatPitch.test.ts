import {describe, expect, it} from 'vitest'
import {boatPitch} from './boatPitch.ts'

describe('boatPitch', () => {
    it('lässt Position 1 auf dem Grundton', () => {
        expect(boatPitch(800, 1)).toBe(800)
    })

    it('legt Position 6 eine Oktave darüber', () => {
        expect(boatPitch(800, 6)).toBe(1600)
    })

    // Pentatonisch: keine kleinen Sekunden, kein Tritonus. Zwei fast gleichzeitige Erfassungen
    // ergeben dadurch einen Zusammenklang statt eines Schwebens — und ein schwebender Ton am Ziel
    // klingt wie ein Fehler, auch wenn keiner passiert ist.
    it('folgt der pentatonischen Leiter', () => {
        expect(boatPitch(800, 2)).toBe(900)
        expect(boatPitch(800, 3)).toBe(1000)
        expect(boatPitch(800, 4)).toBe(1200)
        expect(boatPitch(800, 5)).toBe(Math.round(800 * (5 / 3)))
    })

    // Die Frequenzgrenze der Editoren ist 4000 Hz; ein hoch eingestellter Grundton staucht die
    // Leiter oben, statt darüber hinauszuschießen.
    it('kappt an der oberen Grenze', () => {
        expect(boatPitch(3000, 6)).toBe(4000)
    })

    // Eine Position außerhalb der sechs ist ein Programmfehler, kein Tonfehler: Grundton spielen
    // statt zu raten.
    it('fällt bei unbekannter Position auf den Grundton zurück', () => {
        expect(boatPitch(800, 0)).toBe(800)
        expect(boatPitch(800, 7)).toBe(800)
    })
})
