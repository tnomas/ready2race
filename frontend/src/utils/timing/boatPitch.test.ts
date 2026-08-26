import {describe, expect, it} from 'vitest'
import {CaptureToneDto} from '@api/types.gen.ts'
import {DEFAULT_CAPTURE_TONE} from '@utils/timing/tonePlan.ts'
import {boatCaptureTone, boatPitch} from './boatPitch.ts'

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

describe('boatCaptureTone', () => {
    const tone: CaptureToneDto = {
        frequencyHz: 800,
        durationMillis: 120,
        waveform: 'SQUARE',
        releaseMillis: 40,
    }

    it('hebt den Ton auf die Stufe des getroffenen Bootes', () => {
        expect(boatCaptureTone(tone, true, 4)?.frequencyHz).toBe(1200)
    })

    it('lässt alles außer der Tonhöhe unberührt', () => {
        // Wellenform und Hüllkurve sind die Handschrift des Satzes — die Leiter verschiebt nur
        // die Tonhöhe, sonst klänge Position 4 wie ein anderer Ton und nicht wie derselbe höher.
        expect(boatCaptureTone(tone, true, 4)).toEqual({...tone, frequencyHz: 1200})
    })

    // Der große Erfassungsknopf bankt OHNE Boot — dann bleibt es beim Grundton, und genau das ist
    // die Information: „gebankt, noch ohne Boot".
    it('behält ohne Boot den Grundton', () => {
        expect(boatCaptureTone(tone, true, undefined)).toBe(tone)
    })

    it('behält bei abgeschalteter Leiter den Grundton', () => {
        expect(boatCaptureTone(tone, false, 4)).toBe(tone)
    })

    it('nimmt ohne eingestellten Ton den eingebauten Standard als Grundton', () => {
        expect(boatCaptureTone(undefined, true, 6)?.frequencyHz).toBe(
            DEFAULT_CAPTURE_TONE.frequencyHz * 2,
        )
    })

    // Ohne Boot und ohne eingestellten Ton bleibt es bei undefined — der Posten klingt damit
    // exakt wie vor der Leiter, statt den Standard als Objekt durchzureichen.
    it('bleibt ohne Ton und ohne Boot undefined', () => {
        expect(boatCaptureTone(undefined, true, undefined)).toBeUndefined()
    })
})
