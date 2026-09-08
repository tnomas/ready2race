import {describe, expect, test} from 'vitest'
import {controlOwnsSpace, elementIsTypingTarget, isPrimaryPointer} from './shortcutGuards.ts'

/**
 * Erfasst wird auf `pointerdown`; dort melden Maus-Rechtsklick (2), Mittelklick (1) und Radtaste
 * einen anderen `button`-Wert als der Hauptdruck. Finger und Stift melden 0.
 */
describe('isPrimaryPointer', () => {
    test('Hauptdruck von Maus, Finger oder Stift zaehlt', () => {
        expect(isPrimaryPointer({button: 0})).toBe(true)
    })

    test.each([1, 2, 3, 4])('Nebentaste %i erfasst nicht', button => {
        expect(isPrimaryPointer({button})).toBe(false)
    })
})

/**
 * Die Wächter arbeiten auf dem fokussierten Element; hier bekommen sie nur dessen Merkmale
 * (Tag, Rolle) — ob das Element in einem bestimmten Bereich des Boards steht, darf keine Rolle
 * mehr spielen: Wer einen Knopf fokussiert und Leertaste drückt, meint den Knopf.
 */
describe('controlOwnsSpace', () => {
    test.each(['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'])(
        'ein fokussiertes %s besitzt die Leertaste, egal wo es steht',
        tag => {
            expect(controlOwnsSpace({tagName: tag, role: null})).toBe(true)
        },
    )

    test.each(['button', 'menuitem', 'tab', 'switch', 'checkbox'])(
        'ein Element mit role=%s besitzt die Leertaste',
        role => {
            expect(controlOwnsSpace({tagName: 'DIV', role})).toBe(true)
        },
    )

    test('ein fokussierter Container ohne Bedienrolle gibt die Leertaste dem Board', () => {
        expect(controlOwnsSpace({tagName: 'DIV', role: null})).toBe(false)
        expect(controlOwnsSpace({tagName: 'DIV', role: 'region'})).toBe(false)
    })

    test('ohne fokussiertes Element gehoert die Leertaste dem Board', () => {
        expect(controlOwnsSpace(null)).toBe(false)
    })

    test('Ziffern-Kurzbefehle bleiben bei fokussiertem Knopf erlaubt', () => {
        // Die Boots-Tasten laufen NICHT über den Leertasten-Wächter, sondern nur über die
        // Tipp-Erkennung — ein eben angeklickter Knopf darf sie nicht verschlucken.
        expect(elementIsTypingTarget({tagName: 'BUTTON', isContentEditable: false})).toBe(false)
        expect(elementIsTypingTarget({tagName: 'INPUT', isContentEditable: false})).toBe(true)
        expect(elementIsTypingTarget({tagName: 'DIV', isContentEditable: true})).toBe(true)
    })
})
