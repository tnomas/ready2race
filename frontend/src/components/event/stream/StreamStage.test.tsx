// @vitest-environment jsdom
import {render} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {StreamGraphicViewDto, StreamSceneViewDto} from '@api/types.gen'
import StreamStage from './StreamStage.tsx'

vi.mock('./graphics/StreamGraphic.tsx', () => ({
    default: ({graphic}: {graphic: StreamGraphicViewDto}) => {
        if (graphic.type === 'CLOCK') throw new Error('Uhr kaputt')
        return <span>{graphic.type}</span>
    },
}))

const graphic = (type: StreamGraphicViewDto['type'], placement: StreamGraphicViewDto['placement']) =>
    ({
        type,
        placement,
        size: 'NORMAL',
        visible: true,
        visibleSince: null,
        visibleUntil: null,
        overrideState: 'AUTO',
        match: null,
        result: null,
        provisional: null,
        finishEntries: null,
        schedule: null,
        imageUrl: null,
        sequenceStartedAt: null,
    }) as StreamGraphicViewDto

const view: StreamSceneViewDto = {
    sceneId: 'scene-1',
    background: 'TRANSPARENT',
    chromaColor: null,
    safeAreaPercent: 5,
    trialMode: false,
    trialPhase: null,
    serverTime: '2026-08-14T10:00:00Z',
    graphics: [graphic('CLOCK', 'TOP_RIGHT'), graphic('STARTLIST', 'BOTTOM_CENTER')],
} as StreamSceneViewDto

describe('StreamStage', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('lässt die übrigen Grafiken stehen, wenn eine beim Rendern wirft', () => {
        const {container} = render(
            <StreamStage view={view} clockOffsetMs={0} stale={false} size={{width: 1920, height: 1080}} />,
        )
        expect(container.textContent).toContain('STARTLIST')
        expect(container.textContent).not.toContain('CLOCK')
    })
})
