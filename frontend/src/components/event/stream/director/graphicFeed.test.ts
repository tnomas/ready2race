import {describe, expect, it} from 'vitest'
import {StreamGraphicViewDto} from '@api/types.gen'
import {graphicFeed} from './graphicFeed'

const base = (patch: Partial<StreamGraphicViewDto>): StreamGraphicViewDto => ({
    type: 'STARTLIST',
    placement: 'BOTTOM_CENTER',
    size: 'NORMAL',
    visible: false,
    overrideState: 'AUTO',
    showMaterial: false,
    ...patch,
})

const match = (teams = 1, laps = 0, actualStartTime: string | null = null) =>
    ({
        matchId: 'm1',
        competitionName: 'CMix2x',
        state: 'RUNNING',
        startState: 'SCHEDULED',
        pendingRound: false,
        cancelled: false,
        actualStartTime,
        teams: Array.from({length: teams}, (_, index) => ({
            startNumber: index + 1,
            participants: [],
            failed: false,
            deregistered: false,
            laps: Array.from({length: laps}, (_, lap) => ({name: `Boje ${lap + 1}`, timeString: '1:00.0'})),
        })),
    }) as StreamGraphicViewDto['match']

describe('graphicFeed', () => {
    it('meldet on air, sobald der Server die Grafik sichtbar schaltet', () => {
        expect(graphicFeed(base({visible: true, match: match()}))).toEqual({status: 'onAir'})
    })

    it('meldet aus nur bei bewusst erzwungenem Aus', () => {
        expect(graphicFeed(base({overrideState: 'FORCED_OFF', match: match()}))).toEqual({status: 'off'})
    })

    it('meldet bereit, wenn Inhalt da ist, aber die Automatik gerade nicht einblendet', () => {
        expect(graphicFeed(base({match: match()}))).toEqual({status: 'ready'})
    })

    it('benennt je Typ, warum kein Inhalt vorliegt', () => {
        expect(graphicFeed(base({type: 'STARTLIST'}))).toEqual({status: 'noFeed', reason: 'noPreparing'})
        expect(graphicFeed(base({type: 'NEXT_UP'}))).toEqual({status: 'noFeed', reason: 'noPreparing'})
        expect(graphicFeed(base({type: 'CLOCK'}))).toEqual({status: 'noFeed', reason: 'noRunning'})
        expect(graphicFeed(base({type: 'LAPS'}))).toEqual({status: 'noFeed', reason: 'noRunning'})
        expect(graphicFeed(base({type: 'RESULT'}))).toEqual({status: 'noFeed', reason: 'noResult'})
        expect(graphicFeed(base({type: 'FINISH_TICKER', finishEntries: []}))).toEqual({status: 'noFeed', reason: 'noFinish'})
        expect(graphicFeed(base({type: 'SCHEDULE', schedule: []}))).toEqual({status: 'noFeed', reason: 'noSchedule'})
        expect(graphicFeed(base({type: 'COURSE_IMAGE'}))).toEqual({status: 'noFeed', reason: 'noImage'})
    })

    it('zählt beim Rundenband einen laufenden Lauf ohne Marke als „keine Zwischenzeit“', () => {
        expect(graphicFeed(base({type: 'LAPS', match: match(2, 0, '2026-09-02T10:00:00')}))).toEqual({
            status: 'noFeed',
            reason: 'noSplit',
        })
        expect(graphicFeed(base({type: 'LAPS', match: match(2, 1, '2026-09-02T10:00:00')}))).toEqual({status: 'ready'})
    })

    it('meldet „kein Inhalt“ auch dann, wenn der Server die Grafik sichtbar schaltet — die Bühne zeigt trotzdem nichts', () => {
        expect(graphicFeed(base({type: 'COURSE_IMAGE', visible: true}))).toEqual({status: 'noFeed', reason: 'noImage'})
    })

    it('lässt ein erzwungenes Aus vor „kein Inhalt“ gelten — die Regie hat entschieden', () => {
        expect(graphicFeed(base({type: 'RESULT', overrideState: 'FORCED_OFF'}))).toEqual({status: 'off'})
    })

    it('meldet einen unaufgelösten Lauf-Bezug als eigenen Grund', () => {
        expect(graphicFeed(base({type: 'RESULT', overrideState: 'FORCED_ON'}))).toEqual({
            status: 'noFeed',
            reason: 'unresolved',
        })
    })
})
