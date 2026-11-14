import {describe, expect, test} from 'vitest'
import {
    finalizeSwitchState,
    numbersExplanationKey,
    showExistingMatchesHint,
} from './finalizeRegistrationsLogic.ts'

describe('finalizeSwitchState', () => {
    test('Anbieterliste lädt noch: Fixieren gesperrt, gespeichertes „an“ sichtbar und gesendet', () => {
        expect(finalizeSwitchState(true, true, {kind: 'pending'})).toEqual({
            visible: true,
            blockedBy: 'pending',
            send: true,
        })
    })

    test('Anbieterliste schlägt fehl: gesperrt, nichts still abgeschaltet', () => {
        expect(finalizeSwitchState(true, true, {kind: 'error'})).toEqual({
            visible: true,
            blockedBy: 'error',
            send: true,
        })
        expect(finalizeSwitchState(false, false, {kind: 'error'}).blockedBy).toBe('error')
    })

    test('keine Anbieter (mehr), gespeichert an: Haken bleibt sichtbar und wird gesendet', () => {
        expect(finalizeSwitchState(true, true, {kind: 'loaded', count: 0})).toEqual({
            visible: true,
            blockedBy: null,
            send: true,
        })
    })

    test('keine Anbieter, gespeichert an, bewusst abgewählt: aus', () => {
        expect(finalizeSwitchState(true, false, {kind: 'loaded', count: 0}).send).toBe(false)
    })

    test('keine Anbieter, gespeichert aus: unsichtbar, aus', () => {
        expect(finalizeSwitchState(false, false, {kind: 'loaded', count: 0})).toEqual({
            visible: false,
            blockedBy: null,
            send: false,
        })
    })

    test('mit Anbietern zählt der sichtbare Haken', () => {
        expect(finalizeSwitchState(false, true, {kind: 'loaded', count: 2}).send).toBe(true)
        expect(finalizeSwitchState(true, false, {kind: 'loaded', count: 2}).send).toBe(false)
        expect(finalizeSwitchState(false, false, {kind: 'loaded', count: 2}).visible).toBe(true)
    })
})

describe('Dialogtexte', () => {
    test('nur der zutreffende Fall wird erklärt', () => {
        expect(numbersExplanationKey(true)).toBe('numbersOn')
        expect(numbersExplanationKey(false)).toBe('numbersOff')
    })

    test('Hinweis auf bestehende Läufe nur, wenn es welche gibt (unbekannt: zeigen)', () => {
        expect(showExistingMatchesHint(0)).toBe(false)
        expect(showExistingMatchesHint(3)).toBe(true)
        expect(showExistingMatchesHint(null)).toBe(true)
    })
})
