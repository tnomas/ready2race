import {describe, expect, it} from 'vitest'
import {captureAllowed} from './armed.ts'

describe('captureAllowed', () => {
    it('erlaubt im Onetouch-Betrieb immer', () => {
        expect(captureAllowed('ONETOUCH', false)).toBe(true)
        expect(captureAllowed('ONETOUCH', true)).toBe(true)
    })

    it('erlaubt im Armed-Betrieb nur scharf geschaltet', () => {
        expect(captureAllowed('ARMED', true)).toBe(true)
    })

    // Der eine Fall, um den es geht.
    it('sperrt im Armed-Betrieb, solange entschärft', () => {
        expect(captureAllowed('ARMED', false)).toBe(false)
    })
})
