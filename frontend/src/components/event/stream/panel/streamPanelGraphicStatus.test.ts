import {describe, expect, it} from 'vitest'
import {graphicStatus} from './streamPanelGraphicStatus'

describe('graphicStatus', () => {
    it('on air, wenn der Push visible=true trägt — unabhängig vom Override', () => {
        expect(graphicStatus({visible: true, overrideState: 'AUTO'})).toBe('onAir')
        expect(graphicStatus({visible: true, overrideState: 'FORCED_ON'})).toBe('onAir')
    })

    it('aus, nur bei FORCED_OFF ohne aktuelle Einblendung', () => {
        expect(graphicStatus({visible: false, overrideState: 'FORCED_OFF'})).toBe('off')
    })

    it('bereit bei AUTO ohne aktuelle Einblendung', () => {
        expect(graphicStatus({visible: false, overrideState: 'AUTO'})).toBe('ready')
    })

    it('bereit bei FORCED_ON, das den Platzkonflikt gerade verliert', () => {
        // Zwei FORCED_ON auf demselben Platz: der Verlierer bleibt `visible=false`, ist aber
        // keine bewusste "aus"-Entscheidung der Regie — er kann jederzeit gewinnen.
        expect(graphicStatus({visible: false, overrideState: 'FORCED_ON'})).toBe('ready')
    })
})
