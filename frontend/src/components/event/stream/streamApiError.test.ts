import {describe, expect, test} from 'vitest'
import {extractErrorReason} from './streamApiError'

describe('extractErrorReason', () => {
    test('returns undefined for a plain error without details', () => {
        expect(extractErrorReason(new Error('boom'))).toBeUndefined()
        expect(extractErrorReason(undefined)).toBeUndefined()
        expect(extractErrorReason({})).toBeUndefined()
    })

    test('returns the reason when details carry one', () => {
        expect(extractErrorReason({details: {reason: 'chromaColor must be a hex color'}})).toBe(
            'chromaColor must be a hex color',
        )
    })

    test('ignores a non-string reason', () => {
        expect(extractErrorReason({details: {reason: 42}})).toBeUndefined()
    })

    test('ignores a null details object', () => {
        expect(extractErrorReason({details: null})).toBeUndefined()
    })
})
