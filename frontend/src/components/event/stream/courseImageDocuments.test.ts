import {describe, expect, test} from 'vitest'
import {EventDocumentDto} from '@api/types.gen'
import {classifyCourseImageDocuments} from './courseImageDocuments'

const document = (id: string, name: string): EventDocumentDto =>
    ({id, name}) as unknown as EventDocumentDto

describe('classifyCourseImageDocuments', () => {
    test('is loading while neither an error nor data has arrived yet', () => {
        expect(classifyCourseImageDocuments(null, null)).toEqual({kind: 'loading'})
    })

    test('is forbidden on a 403 - the READ EVENT gate a stream-only role does not clear', () => {
        expect(classifyCourseImageDocuments({status: 403}, null)).toEqual({kind: 'forbidden'})
    })

    test('is a generic error on any other failure status', () => {
        expect(classifyCourseImageDocuments({status: 500}, null)).toEqual({kind: 'error'})
        expect(classifyCourseImageDocuments({status: 401}, null)).toEqual({kind: 'error'})
    })

    test('is empty once loaded with zero documents', () => {
        expect(classifyCourseImageDocuments(null, {data: []})).toEqual({kind: 'empty'})
    })

    test('carries the documents through once loaded with some', () => {
        const documents = [document('1', 'Streckenbild.png')]
        expect(classifyCourseImageDocuments(null, {data: documents})).toEqual({
            kind: 'loaded',
            documents,
        })
    })

    test('an error always wins over a present (stale) documents list', () => {
        const documents = [document('1', 'Streckenbild.png')]
        expect(classifyCourseImageDocuments({status: 403}, {data: documents})).toEqual({kind: 'forbidden'})
    })
})
