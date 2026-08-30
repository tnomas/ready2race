import {describe, expect, it} from 'vitest'
import {StreamGraphicViewDto} from '@api/types.gen'
import {hasGraphicContent, retainGraphicContent} from './retainGraphicContent'

const baseMatch = {
    matchId: 'match-1',
    competitionName: 'Achter',
    state: 'PREPARING',
    startState: 'SCHEDULED',
    teams: [],
    pendingRound: false,
    cancelled: false,
} as unknown as StreamGraphicViewDto['match']

const graphic = (overrides: Partial<StreamGraphicViewDto>): StreamGraphicViewDto => ({
    type: 'STARTLIST',
    placement: 'BOTTOM_CENTER',
    size: 'NORMAL',
    visible: false,
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
    ...overrides,
})

describe('hasGraphicContent', () => {
    it('ist wahr mit match', () => {
        expect(hasGraphicContent(graphic({match: baseMatch}))).toBe(true)
    })

    it('ist wahr mit result', () => {
        expect(
            hasGraphicContent(
                graphic({result: {matchId: 'm', competitionName: 'x', teams: []} as never}),
            ),
        ).toBe(true)
    })

    it('ist wahr mit nicht-leeren finishEntries', () => {
        expect(
            hasGraphicContent(
                graphic({
                    finishEntries: [
                        {rank: 1, startNumber: 1, clubsShort: null, clubsFull: null, timeString: '1:00'},
                    ],
                }),
            ),
        ).toBe(true)
    })

    it('ist falsch mit leeren finishEntries', () => {
        expect(hasGraphicContent(graphic({finishEntries: []}))).toBe(false)
    })

    it('ist wahr mit nicht-leerem schedule', () => {
        expect(hasGraphicContent(graphic({schedule: [baseMatch!]}))).toBe(true)
    })

    it('ist falsch mit leerem schedule', () => {
        expect(hasGraphicContent(graphic({schedule: []}))).toBe(false)
    })

    it('ist wahr mit imageUrl', () => {
        expect(hasGraphicContent(graphic({imageUrl: 'https://example.test/course.png'}))).toBe(true)
    })

    it('ist falsch ganz ohne Inhalt', () => {
        expect(hasGraphicContent(graphic({}))).toBe(false)
    })
})

describe('retainGraphicContent', () => {
    it('liefert den aktuellen Push unverändert, wenn er selbst Inhalt trägt', () => {
        const current = graphic({visible: true, match: baseMatch})
        expect(retainGraphicContent(current, null)).toBe(current)
    })

    it('liefert den aktuellen Push unverändert ohne vorigen Stand', () => {
        const current = graphic({visible: false, match: null})
        expect(retainGraphicContent(current, null)).toBe(current)
    })

    it('behält den Inhalt des vorigen Standes, wenn derselbe Push visible UND Inhalt löscht', () => {
        // Der Fall aus dem Review: Sequenzstart oder Laufende räumt `input.preparing`/
        // `input.running` genau in dem Push leer, der auch `visible=false` setzt.
        const previous = graphic({
            visible: true,
            visibleSince: '2026-08-27T10:00:00Z',
            visibleUntil: '2026-08-27T10:00:15Z',
            match: baseMatch,
        })
        const current = graphic({visible: false, visibleSince: null, visibleUntil: null, match: null})

        const result = retainGraphicContent(current, previous)

        expect(result.match).toBe(baseMatch)
        // visible/visibleSince/visibleUntil kommen IMMER vom aktuellen Push — nur der Inhalt
        // fällt zurück, GraphicFrame blendet anhand von `visible` aus.
        expect(result.visible).toBe(false)
        expect(result.visibleSince).toBeNull()
        expect(result.visibleUntil).toBeNull()
    })

    it('rührt result/provisional/finishEntries/schedule/imageUrl bei der Rückfall-Übernahme mit', () => {
        const previous = graphic({
            visible: true,
            type: 'RESULT',
            result: {matchId: 'm', competitionName: 'x', teams: []} as never,
            provisional: true,
        })
        const current = graphic({visible: false, type: 'RESULT', result: null, provisional: null})

        const result = retainGraphicContent(current, previous)

        expect(result.result).toBe(previous.result)
        expect(result.provisional).toBe(true)
    })

    it('behält bei CLOCK das ganze Sequenz-Bündel, wenn ein Push alles gemeinsam räumt (abgebrochene Startsequenz)', () => {
        // Review-Fall: Eine Startsequenz bricht ab, bevor `actualStartTime` gestempelt wird —
        // derselbe Push räumt `match` UND die Sequenzfelder gemeinsam mit `visible=false`.
        // Ohne Rückfall auf die vorigen Sequenzfelder würde `streamClockState` weder einen
        // gestempelten Start noch einen VOLLSTÄNDIGEN Sequenzanker sehen (ohne
        // `sequenceFiresAt` zeigt sie bewusst nichts) und sofort auf `hidden` springen,
        // statt den Countdown durch `GraphicFrame`s Ausblendanimation hindurch einzufrieren.
        const previous = graphic({
            type: 'CLOCK',
            visible: true,
            match: baseMatch,
            sequenceStartedAt: '2026-08-27T10:00:00Z',
            sequenceFiresAt: '2026-08-27T10:00:30Z',
            sequencePausedAt: '2026-08-27T10:00:19Z',
        })
        const current = graphic({
            type: 'CLOCK',
            visible: false,
            match: null,
            sequenceStartedAt: null,
            sequenceFiresAt: null,
            sequencePausedAt: null,
        })

        const result = retainGraphicContent(current, previous)

        expect(result.match).toBe(baseMatch)
        expect(result.sequenceStartedAt).toBe('2026-08-27T10:00:00Z')
        expect(result.sequenceFiresAt).toBe('2026-08-27T10:00:30Z')
        expect(result.sequencePausedAt).toBe('2026-08-27T10:00:19Z')
        expect(result.visible).toBe(false)
    })

    it('übernimmt nichts von einem vorigen Stand eines ANDEREN Grafik-Typs', () => {
        const previous = graphic({type: 'LAPS', visible: true, match: baseMatch})
        const current = graphic({type: 'STARTLIST', visible: false, match: null})

        expect(retainGraphicContent(current, previous)).toBe(current)
    })

    it('bleibt inhaltslos, wenn auch der vorige Stand schon keinen Inhalt trug', () => {
        const previous = graphic({visible: false, match: null})
        const current = graphic({visible: false, match: null})

        expect(retainGraphicContent(current, previous)).toBe(current)
    })
})
