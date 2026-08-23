import {describe, expect, it} from 'vitest'
import {composeDocumentTitle} from './useDocumentTitle.ts'

// Die reine Zusammensetzung des Tab-Titels — der DOM-Teil des Hooks (setzen/zurücksetzen) läuft
// ohne Test-DOM nicht und ist bewusst dünn gehalten; die Teile-Logik ist das, was kaputtgehen kann.
describe('composeDocumentTitle', () => {
    it('hängt den App-Namen ans Ende', () => {
        expect(composeDocumentTitle(['Start Hafen'])).toBe('Start Hafen · Ready2Race')
        expect(composeDocumentTitle(['Ziel', 'Startbildschirm'])).toBe(
            'Ziel · Startbildschirm · Ready2Race',
        )
    })

    it('lässt leere und noch nicht geladene Teile weg', () => {
        // z. B. ein Postenname, der erst nach dem ersten Fetch da ist.
        expect(composeDocumentTitle([undefined, 'Leitstand'])).toBe('Leitstand · Ready2Race')
        expect(composeDocumentTitle([null, '', '  '])).toBe('Ready2Race')
        expect(composeDocumentTitle([])).toBe('Ready2Race')
    })
})
