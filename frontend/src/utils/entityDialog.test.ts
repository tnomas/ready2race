import {describe, expect, it} from 'vitest'
import {
    DialogOpenState,
    shouldConfirmDiscard,
    shouldConfirmLeaving,
    shouldRunOnOpen,
} from './entityDialog.ts'

const state = (s: Partial<DialogOpenState>): DialogOpenState => ({
    open: true,
    wasOpen: true,
    onOpenChanged: false,
    entityChanged: false,
    dirty: false,
    ...s,
})

describe('shouldRunOnOpen', () => {
    it('befüllt beim Öffnen immer, auch mit Änderungen aus dem letzten Mal', () => {
        expect(shouldRunOnOpen(state({wasOpen: false}))).toBe(true)
        expect(shouldRunOnOpen(state({wasOpen: false, dirty: true}), 'never')).toBe(true)
    })

    it('tut bei geschlossenem Dialog nichts', () => {
        expect(shouldRunOnOpen(state({open: false, wasOpen: false, onOpenChanged: true}))).toBe(
            false,
        )
    })

    it('tut ohne neue onOpen-Identität nichts', () => {
        expect(shouldRunOnOpen(state({}))).toBe(false)
    })

    it('übernimmt nachgeladene Daten, solange nichts geändert wurde', () => {
        expect(shouldRunOnOpen(state({onOpenChanged: true}))).toBe(true)
    })

    it('wirft Eingaben bei einem Hintergrund-Abgleich nicht weg (Zeitplan-Slot-Dialog)', () => {
        expect(shouldRunOnOpen(state({onOpenChanged: true, dirty: true}))).toBe(false)
    })

    it('befüllt neu, wenn bei offenem Dialog ein anderer Datensatz kommt', () => {
        expect(shouldRunOnOpen(state({entityChanged: true, dirty: true}))).toBe(true)
    })

    it('kennt das frühere Verhalten und das reine Öffnen', () => {
        expect(shouldRunOnOpen(state({onOpenChanged: true, dirty: true}), 'always')).toBe(true)
        expect(shouldRunOnOpen(state({onOpenChanged: true}), 'never')).toBe(false)
    })
})

describe('shouldConfirmDiscard', () => {
    it('fragt nur bei Änderungen nach', () => {
        expect(shouldConfirmDiscard({enabled: true, dirty: true, submitting: false})).toBe(true)
        expect(shouldConfirmDiscard({enabled: true, dirty: false, submitting: false})).toBe(false)
    })
    it('ist abschaltbar', () => {
        expect(shouldConfirmDiscard({enabled: false, dirty: true, submitting: false})).toBe(false)
    })
    it('fragt während des Speicherns nicht', () => {
        expect(shouldConfirmDiscard({enabled: true, dirty: true, submitting: true})).toBe(false)
    })
})

describe('shouldConfirmLeaving', () => {
    it('fragt bei ungespeicherten Eingaben und bestehender Sitzung nach', () => {
        expect(shouldConfirmLeaving({unsavedChanges: true, signedIn: true})).toBe(true)
    })

    it('lässt die Navigation des Abmeldens durch, auch mit ungespeicherten Eingaben', () => {
        expect(shouldConfirmLeaving({unsavedChanges: true, signedIn: false})).toBe(false)
    })

    it('ohne ungespeicherte Eingaben nie', () => {
        expect(shouldConfirmLeaving({unsavedChanges: false, signedIn: true})).toBe(false)
    })
})
