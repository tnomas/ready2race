import {describe, expect, test} from 'vitest'
import {LiveDashboardMatchState} from '@api/types.gen.ts'
import {cardActionPlan} from './cardActionPlan.ts'

const none = {
    showFinish: false,
    showActivationToggle: false,
    showMarkStarted: false,
    showClarify: false,
    showResolveClarification: false,
}

const plan = (state: LiveDashboardMatchState, controls: Partial<typeof none>) =>
    cardActionPlan(state, {...none, ...controls})

describe('cardActionPlan', () => {
    test('anstehender Lauf: an den Start rufen ist die Primäraktion', () => {
        expect(plan('UPCOMING', {showActivationToggle: true})).toEqual({
            primary: 'activate',
            secondary: [],
            menu: [],
        })
        expect(plan('UNSCHEDULED', {showActivationToggle: true}).primary).toBe('activate')
    })

    test('in Vorbereitung: „Läuft" vorn, Beenden daneben, Klärung und Deaktivieren im Menü', () => {
        expect(
            plan('PREPARING', {
                showActivationToggle: true,
                showMarkStarted: true,
                showFinish: true,
                showClarify: true,
            }),
        ).toEqual({primary: 'markStarted', secondary: ['finish'], menu: ['clarify', 'deactivate']})
    })

    test('läuft: Beenden vorn, der Rest im Menü', () => {
        expect(
            plan('RUNNING', {showActivationToggle: true, showFinish: true, showClarify: true}),
        ).toEqual({primary: 'finish', secondary: [], menu: ['clarify', 'deactivate']})
    })

    test('wartet auf Beenden: Beenden vorn, Klärung im Menü', () => {
        expect(plan('AWAITING_FINISH', {showFinish: true, showClarify: true})).toEqual({
            primary: 'finish',
            secondary: [],
            menu: ['clarify'],
        })
    })

    test('ohne Beenden-Recht (Modus Regattabüro) bleibt keine Primäraktion, nur das Menü', () => {
        expect(plan('RUNNING', {showActivationToggle: true, showClarify: true})).toEqual({
            primary: null,
            secondary: [],
            menu: ['clarify', 'deactivate'],
        })
    })

    test('in Klärung: Beenden vorn, Aufheben sichtbar daneben', () => {
        expect(plan('CLARIFICATION', {showFinish: true, showResolveClarification: true})).toEqual({
            primary: 'finish',
            secondary: ['resolveClarification'],
            menu: [],
        })
        // ohne Beenden wird Aufheben zur Primäraktion
        expect(plan('CLARIFICATION', {showResolveClarification: true}).primary).toBe(
            'resolveClarification',
        )
    })

    test('beendeter Lauf: keine Primäraktion, Reaktivieren nur im Menü', () => {
        expect(plan('FINISHED', {showActivationToggle: true})).toEqual({
            primary: null,
            secondary: [],
            menu: ['activate'],
        })
    })

    test('ohne Steuerrecht gibt es nichts', () => {
        for (const state of [
            'UPCOMING',
            'PREPARING',
            'RUNNING',
            'AWAITING_FINISH',
            'CLARIFICATION',
            'FINISHED',
            'SKIPPED',
            'UNSCHEDULED',
        ] as const) {
            expect(plan(state, {})).toEqual({primary: null, secondary: [], menu: []})
        }
    })

    test('keine Handlung erscheint doppelt und keine verfügbare geht verloren', () => {
        const all = {
            showFinish: true,
            showActivationToggle: true,
            showMarkStarted: true,
            showClarify: true,
            showResolveClarification: true,
        }
        for (const state of ['UPCOMING', 'PREPARING', 'RUNNING', 'CLARIFICATION'] as const) {
            const p = plan(state, all)
            const shown = [p.primary, ...p.secondary, ...p.menu].filter(Boolean)
            expect(new Set(shown).size).toBe(shown.length)
            // fünf verfügbare Handlungen (activate ODER deactivate, je nach Zustand)
            expect(shown).toHaveLength(5)
        }
    })
})
