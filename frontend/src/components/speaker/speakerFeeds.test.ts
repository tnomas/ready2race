import {describe, expect, it} from 'vitest'
import {summarizeFeeds} from './speakerFeeds.ts'

const pending = {data: null, error: null}
const loaded = {data: [], error: null}
const failed = {data: null, error: {status: 500}}

describe('summarizeFeeds', () => {
    it('gilt als geladen, sobald ein Feed Daten hat', () => {
        expect(summarizeFeeds([loaded, pending, pending])).toEqual({loaded: true, failed: 0})
    })

    it('wartet, solange nichts da ist und nichts gescheitert ist', () => {
        expect(summarizeFeeds([pending, pending, pending])).toEqual({loaded: false, failed: 0})
    })

    it('wartet weiter, wenn ein Feed scheitert und die anderen noch unterwegs sind', () => {
        expect(summarizeFeeds([failed, pending, pending])).toEqual({loaded: false, failed: 1})
    })

    it('gilt als geladen, wenn alle drei gescheitert sind - der Wartekreis darf nicht ewig drehen', () => {
        expect(summarizeFeeds([failed, failed, failed])).toEqual({loaded: true, failed: 3})
    })

    it('zählt die gescheiterten Feeds neben geladenen', () => {
        expect(summarizeFeeds([loaded, failed, loaded])).toEqual({loaded: true, failed: 1})
    })
})
