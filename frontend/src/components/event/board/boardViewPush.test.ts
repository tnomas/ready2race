import {describe, expect, it} from 'vitest'
import {BoardConfig, BoardElementType} from '@api/types.gen'
import {boardNeedsRealtime, buildBoardViewWsUrl, parseBoardViewMessage} from './boardViewPush'

const configWith = (...types: BoardElementType[]): BoardConfig => ({
    columns: 1,
    tiles: [
        {
            rotationIntervalSeconds: 10,
            colSpan: 1,
            rowSpan: 1,
            elements: types.map(type => ({type})),
        },
    ],
})

describe('buildBoardViewWsUrl', () => {
    it('baut aus einer absoluten API-Basis die ws-URL', () => {
        expect(
            buildBoardViewWsUrl(
                'http://localhost:8138/api',
                'http://localhost:5178/',
                'ev-1',
                'bd-1',
            ),
        ).toBe('ws://localhost:8138/api/ws/event/ev-1/board/bd-1')
    })

    it('löst eine relative Basis gegen die Seite auf und wählt wss bei https', () => {
        expect(
            buildBoardViewWsUrl('/api', 'https://regatta.example.org/board/x', 'ev-2', 'bd-2'),
        ).toBe('wss://regatta.example.org/api/ws/event/ev-2/board/bd-2')
    })

    it('verkraftet eine Basis mit Schluss-Schrägstrich ohne doppelten Pfadtrenner', () => {
        expect(
            buildBoardViewWsUrl(
                'http://localhost:8138/api/',
                'http://localhost:5178/',
                'ev-3',
                'bd-3',
            ),
        ).toBe('ws://localhost:8138/api/ws/event/ev-3/board/bd-3')
    })
})

describe('parseBoardViewMessage', () => {
    it('liefert die Ansicht aus dem Umschlag', () => {
        const raw = JSON.stringify({type: 'boardView', view: {boardId: 'bd-1', eventName: 'CRF'}})
        expect(parseBoardViewMessage(raw)?.boardId).toBe('bd-1')
    })

    it('verwirft Unlesbares, statt die Anzeige mitzureißen', () => {
        expect(parseBoardViewMessage('kein json')).toBeNull()
        expect(parseBoardViewMessage('null')).toBeNull()
        expect(parseBoardViewMessage('42')).toBeNull()
    })

    it('verwirft einen künftigen Nachrichtentyp, statt ihn als Ansicht zu deuten', () => {
        expect(parseBoardViewMessage(JSON.stringify({type: 'somethingNew', view: {}}))).toBeNull()
    })

    it('verlangt eine Ansicht mit boardId — daran erkennt die Anzeige ihren eigenen Stand', () => {
        expect(parseBoardViewMessage(JSON.stringify({type: 'boardView'}))).toBeNull()
        expect(parseBoardViewMessage(JSON.stringify({type: 'boardView', view: {}}))).toBeNull()
        expect(parseBoardViewMessage(JSON.stringify({type: 'boardView', view: null}))).toBeNull()
    })
})

describe('boardNeedsRealtime', () => {
    it.each<BoardElementType>([
        'MATCH',
        'MATCH_DETAIL',
        'MATCH_LIST',
        'STREAM',
        'DELAY',
        'AWARD_CEREMONY',
    ])('öffnet den Kanal für %s — die Kachel hängt am Renngeschehen', type => {
        expect(boardNeedsRealtime(configWith(type))).toBe(true)
    })

    it('lässt ein reines Uhr-/Text-Board ohne Verbindung', () => {
        expect(boardNeedsRealtime(configWith('CLOCK', 'TEXT'))).toBe(false)
    })

    it('genügt eine einzige Echtzeit-Kachel — der Kanal schickt ohnehin die ganze Ansicht', () => {
        expect(boardNeedsRealtime(configWith('CLOCK', 'TEXT', 'STREAM'))).toBe(true)
    })

    it('bleibt vor der ersten geladenen Konfiguration bei „nein"', () => {
        expect(boardNeedsRealtime(null)).toBe(false)
        expect(boardNeedsRealtime(undefined)).toBe(false)
    })
})
