import {describe, expect, test} from 'vitest'
import {armReloadGate, nextReloadGate} from './reloadGate.ts'

describe('nextReloadGate', () => {
    const old = {stand: 1}
    const fresh = {stand: 2}

    test('bleibt zu, bis das Nachladen begonnen hat und ein neuer Stand da ist', () => {
        let gate = armReloadGate(old)
        gate = nextReloadGate(gate, old, false)
        expect(gate).not.toBeNull()
        gate = nextReloadGate(gate, old, true)
        expect(gate).not.toBeNull()
        expect(nextReloadGate(gate, fresh, false)).toBeNull()
    })

    test('ein neuer Stand öffnet sofort', () => {
        expect(nextReloadGate(armReloadGate(old), fresh, true)).toBeNull()
    })

    test('ein gescheitertes Nachladen (Stand bleibt) öffnet nach Ende des Ladens', () => {
        let gate = nextReloadGate(armReloadGate(old), old, true)
        gate = nextReloadGate(gate, old, false)
        expect(gate).toBeNull()
    })

    test('ohne Sperre bleibt es offen', () => {
        expect(nextReloadGate(null, old, true)).toBeNull()
    })
})
