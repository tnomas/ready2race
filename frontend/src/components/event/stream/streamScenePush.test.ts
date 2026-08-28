import {describe, expect, it, vi} from 'vitest'
import {
    buildStreamSceneWsUrl,
    dispatchStreamSceneFrame,
    isRecognizedStreamSceneFrame,
    parseStreamSceneMessage,
} from './streamScenePush'

describe('buildStreamSceneWsUrl', () => {
    it('baut aus einer absoluten API-Basis die ws-URL', () => {
        expect(
            buildStreamSceneWsUrl(
                'http://localhost:8138/api',
                'http://localhost:5178/',
                'ev-1',
                'sc-1',
            ),
        ).toBe('ws://localhost:8138/api/ws/event/ev-1/stream/sc-1')
    })

    it('löst eine relative Basis gegen die Seite auf und wählt wss bei https', () => {
        expect(
            buildStreamSceneWsUrl('/api', 'https://regatta.example.org/x', 'ev-2', 'sc-2'),
        ).toBe('wss://regatta.example.org/api/ws/event/ev-2/stream/sc-2')
    })

    it('verkraftet eine Basis mit Schluss-Schrägstrich ohne doppelten Pfadtrenner', () => {
        expect(
            buildStreamSceneWsUrl(
                'http://localhost:8138/api/',
                'http://localhost:5178/',
                'ev-3',
                'sc-3',
            ),
        ).toBe('ws://localhost:8138/api/ws/event/ev-3/stream/sc-3')
    })
})

describe('parseStreamSceneMessage', () => {
    it('liefert die Ansicht aus dem Umschlag', () => {
        const raw = JSON.stringify({
            type: 'streamSceneView',
            view: {sceneId: 'sc-1', background: 'TRANSPARENT'},
        })
        expect(parseStreamSceneMessage(raw)?.sceneId).toBe('sc-1')
    })

    it('verwirft Unlesbares, statt die Bühne mitzureißen', () => {
        expect(parseStreamSceneMessage('kein json')).toBeNull()
        expect(parseStreamSceneMessage('null')).toBeNull()
        expect(parseStreamSceneMessage('42')).toBeNull()
    })

    it('verwirft einen künftigen Nachrichtentyp, statt ihn als Ansicht zu deuten', () => {
        expect(parseStreamSceneMessage(JSON.stringify({type: 'somethingNew', view: {}}))).toBeNull()
    })

    it('verlangt eine Ansicht mit sceneId — daran erkennt die Bühne ihren eigenen Stand', () => {
        expect(parseStreamSceneMessage(JSON.stringify({type: 'streamSceneView'}))).toBeNull()
        expect(parseStreamSceneMessage(JSON.stringify({type: 'streamSceneView', view: {}}))).toBeNull()
        expect(
            parseStreamSceneMessage(JSON.stringify({type: 'streamSceneView', view: null})),
        ).toBeNull()
    })
})

describe('isRecognizedStreamSceneFrame', () => {
    it('erkennt einen Zustandsrahmen', () => {
        expect(
            isRecognizedStreamSceneFrame(
                JSON.stringify({type: 'streamSceneView', view: {sceneId: 'sc-1'}}),
            ),
        ).toBe(true)
    })

    it('erkennt den inhaltslosen Herzschlag genauso — er zählt für die Lebendigkeit', () => {
        expect(isRecognizedStreamSceneFrame(JSON.stringify({type: 'heartbeat'}))).toBe(true)
    })

    it('erkennt auch einen künftigen, hier noch unbekannten Typ — nur die Form zählt', () => {
        expect(isRecognizedStreamSceneFrame(JSON.stringify({type: 'somethingNew'}))).toBe(true)
    })

    it('verwirft Unlesbares und Rahmen ohne type-Feld', () => {
        expect(isRecognizedStreamSceneFrame('kein json')).toBe(false)
        expect(isRecognizedStreamSceneFrame('null')).toBe(false)
        expect(isRecognizedStreamSceneFrame('42')).toBe(false)
        expect(isRecognizedStreamSceneFrame(JSON.stringify({}))).toBe(false)
        expect(isRecognizedStreamSceneFrame(JSON.stringify({type: 42}))).toBe(false)
    })
})

describe('dispatchStreamSceneFrame', () => {
    it('wendet einen Zustandsrahmen SOFORT an — ganz ohne Sichtbarkeits-Bedingung', () => {
        // Regressionstest für den kritischen Befund: eine frühere Fassung stellte die Ansicht
        // zurück, solange `document.hidden` galt — genau das darf hier nicht mehr passieren,
        // eine Aufnahmequelle (Wirecast/CEF) meldet ihr Dokument oft dauerhaft als verdeckt.
        const onFrame = vi.fn()
        const onView = vi.fn()
        const raw = JSON.stringify({type: 'streamSceneView', view: {sceneId: 'sc-1'}})

        dispatchStreamSceneFrame(raw, onFrame, onView)

        expect(onFrame).toHaveBeenCalledTimes(1)
        expect(onView).toHaveBeenCalledTimes(1)
        expect(onView.mock.calls[0][0].sceneId).toBe('sc-1')
    })

    it('zählt einen Herzschlag als Lebenszeichen, ohne eine Ansicht anzuwenden', () => {
        const onFrame = vi.fn()
        const onView = vi.fn()

        dispatchStreamSceneFrame(JSON.stringify({type: 'heartbeat'}), onFrame, onView)

        expect(onFrame).toHaveBeenCalledTimes(1)
        expect(onView).not.toHaveBeenCalled()
    })

    it('ignoriert Unlesbares, ohne [onFrame] auszulösen', () => {
        const onFrame = vi.fn()
        const onView = vi.fn()

        dispatchStreamSceneFrame('kein json', onFrame, onView)

        expect(onFrame).not.toHaveBeenCalled()
        expect(onView).not.toHaveBeenCalled()
    })

    it('kommt ohne [onFrame] aus (optional)', () => {
        const onView = vi.fn()
        expect(() =>
            dispatchStreamSceneFrame(
                JSON.stringify({type: 'streamSceneView', view: {sceneId: 'sc-1'}}),
                undefined,
                onView,
            ),
        ).not.toThrow()
        expect(onView).toHaveBeenCalledTimes(1)
    })
})
