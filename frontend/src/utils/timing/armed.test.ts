import {describe, expect, it} from 'vitest'
import {TimingStationDto, TimingStationType} from '@api/types.gen.ts'
import {armedGateApplies, captureAllowed, stationArmedBadge} from './armed.ts'

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

describe('armedGateApplies', () => {
    it('greift am Ziel- und am Zwischenzeit-Posten im Armed-Betrieb', () => {
        expect(armedGateApplies('FINISH', 'ARMED')).toBe(true)
        expect(armedGateApplies('SPLIT', 'ARMED')).toBe(true)
    })

    it('greift im Onetouch-Betrieb nirgends', () => {
        expect(armedGateApplies('FINISH', 'ONETOUCH')).toBe(false)
        expect(armedGateApplies('SPLIT', 'ONETOUCH')).toBe(false)
        expect(armedGateApplies('START', 'ONETOUCH')).toBe(false)
        expect(armedGateApplies('ANZEIGE', 'ONETOUCH')).toBe(false)
    })

    // Am Start gibt es keine Erfassung mit Zuordnung, die Anzeige erfasst gar nichts - eine Sperre
    // nähme dort nur Bedienwege, ohne etwas zu verhindern.
    it('greift auch im Armed-Betrieb nicht am Start- und am Anzeige-Posten', () => {
        expect(armedGateApplies('START', 'ARMED')).toBe(false)
        expect(armedGateApplies('ANZEIGE', 'ARMED')).toBe(false)
    })
})

const station = (
    type: TimingStationType,
    captureMode: 'ONETOUCH' | 'ARMED',
    armed: boolean,
): TimingStationDto => ({
    id: 'station',
    event: 'event',
    name: 'Boje 1',
    type,
    sorting: 0,
    captureMode,
    armed,
})

describe('stationArmedBadge', () => {
    it('meldet scharf und entschärft, wo die Sperre greift', () => {
        expect(stationArmedBadge(station('FINISH', 'ARMED', true))).toBe('ARMED')
        expect(stationArmedBadge(station('FINISH', 'ARMED', false))).toBe('DISARMED')
        expect(stationArmedBadge(station('SPLIT', 'ARMED', false))).toBe('DISARMED')
    })

    it('meldet Onetouch im Onetouch-Betrieb', () => {
        expect(stationArmedBadge(station('FINISH', 'ONETOUCH', false))).toBe('ONETOUCH')
        expect(stationArmedBadge(station('START', 'ONETOUCH', false))).toBe('ONETOUCH')
    })

    // Kein blinder Alarm: Am Startposten hält der Zustand niemanden auf, also meldet der Leitstand
    // auch keine Sperre - sonst riefe die Regattaleitung wegen nichts an.
    it('meldet am Startposten Onetouch, auch wenn er entschärft auf ARMED steht', () => {
        expect(stationArmedBadge(station('START', 'ARMED', false))).toBe('ONETOUCH')
    })

    // Ein Anzeige-Posten erfasst nie - „Onetouch“ wäre dort eine Aussage über eine Erfassung,
    // die es gar nicht gibt.
    it('gibt dem Anzeige-Posten gar kein Abzeichen', () => {
        expect(stationArmedBadge(station('ANZEIGE', 'ONETOUCH', false))).toBeNull()
        expect(stationArmedBadge(station('ANZEIGE', 'ARMED', false))).toBeNull()
    })
})
