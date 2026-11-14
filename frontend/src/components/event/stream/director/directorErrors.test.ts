import {describe, expect, it} from 'vitest'
import {sceneViewErrorKey} from './directorErrors'

describe('sceneViewErrorKey', () => {
    it('nennt eine verschwundene Szene beim Namen', () => {
        expect(sceneViewErrorKey({status: 404})).toBe('event.stream.director.sceneGone')
    })

    it('fällt sonst auf die allgemeine Fehlermeldung zurück', () => {
        expect(sceneViewErrorKey({status: 500})).toBe('common.error.unexpected')
        expect(sceneViewErrorKey({status: 403})).toBe('common.error.unexpected')
    })
})
