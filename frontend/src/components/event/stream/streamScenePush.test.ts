import {describe, expect, it} from 'vitest'
import {buildStreamSceneWsUrl, parseStreamSceneMessage} from './streamScenePush'

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
