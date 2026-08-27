import {describe, expect, test} from 'vitest'
import {hasStreamSceneFormErrors, validateStreamSceneForm} from './streamSceneValidation'

const validForm = {
    name: 'Zieleinlauf',
    background: 'TRANSPARENT' as const,
    chromaColor: '',
    safeAreaPercent: 5,
}

describe('validateStreamSceneForm', () => {
    test('accepts a valid transparent scene', () => {
        const errors = validateStreamSceneForm(validForm)
        expect(hasStreamSceneFormErrors(errors)).toBe(false)
    })

    test('rejects a blank or whitespace-only name', () => {
        expect(validateStreamSceneForm({...validForm, name: ''}).name).toBe(true)
        expect(validateStreamSceneForm({...validForm, name: '   '}).name).toBe(true)
    })

    test.each([-1, 101, NaN])('rejects safeAreaPercent %s', value => {
        expect(validateStreamSceneForm({...validForm, safeAreaPercent: value}).safeAreaPercent).toBe(true)
    })

    test.each([0, 50, 100])('accepts safeAreaPercent %s', value => {
        expect(validateStreamSceneForm({...validForm, safeAreaPercent: value}).safeAreaPercent).toBe(false)
    })

    test('does not require a chromaColor when background is TRANSPARENT', () => {
        expect(validateStreamSceneForm({...validForm, background: 'TRANSPARENT', chromaColor: ''}).chromaColor).toBe(
            false,
        )
    })

    test('requires a hex chromaColor when background is CHROMA', () => {
        expect(validateStreamSceneForm({...validForm, background: 'CHROMA', chromaColor: ''}).chromaColor).toBe(true)
        expect(
            validateStreamSceneForm({...validForm, background: 'CHROMA', chromaColor: 'green'}).chromaColor,
        ).toBe(true)
    })

    test.each(['#0F0', '#00ff00', '#ABC'])('accepts hex color %s for CHROMA', value => {
        expect(
            validateStreamSceneForm({...validForm, background: 'CHROMA', chromaColor: value}).chromaColor,
        ).toBe(false)
    })
})
