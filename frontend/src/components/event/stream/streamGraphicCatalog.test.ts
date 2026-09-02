import {describe, expect, test} from 'vitest'
import {StreamSceneGraphicDto} from '@api/types.gen'
import {
    ALLOWED_PLACEMENTS,
    STREAM_GRAPHIC_TYPES,
    defaultGraphicRow,
    usesDisplaySeconds,
    usesImageDocument,
    usesListLength,
    withAllGraphicTypes,
} from './streamGraphicCatalog'

describe('ALLOWED_PLACEMENTS', () => {
    test('carries all eight graphic types', () => {
        expect(Object.keys(ALLOWED_PLACEMENTS).sort()).toEqual([...STREAM_GRAPHIC_TYPES].sort())
    })

    test('never offers an empty placement set', () => {
        for (const type of STREAM_GRAPHIC_TYPES) {
            expect(ALLOWED_PLACEMENTS[type].length).toBeGreaterThan(0)
        }
    })

    // Stichprobe gegen die Backend-Zuordnung (StreamEnums.kt) - falls die auseinanderlaufen,
    // bietet die Maske einen Platz an, den der Server ablehnt.
    test('matches the backend mapping for a few representative types', () => {
        expect(ALLOWED_PLACEMENTS.CLOCK).toEqual(['TOP_RIGHT', 'TOP_LEFT'])
        expect(ALLOWED_PLACEMENTS.SCHEDULE).toEqual(['FULL_CENTER'])
        expect(ALLOWED_PLACEMENTS.FINISH_TICKER).toEqual(['SIDE_RIGHT', 'SIDE_LEFT'])
        expect(ALLOWED_PLACEMENTS.RESULT).toEqual(['BOTTOM_CENTER', 'FULL_CENTER'])
        // Seit der Neugestaltung darf auch die Aufstellung als Vollbild-Tafel stehen.
        expect(ALLOWED_PLACEMENTS.STARTLIST).toEqual(['BOTTOM_CENTER', 'BOTTOM_LEFT', 'BOTTOM_RIGHT', 'FULL_CENTER'])
    })
})

describe('defaultGraphicRow', () => {
    test('picks a placement that is actually allowed for the type', () => {
        for (const type of STREAM_GRAPHIC_TYPES) {
            const row = defaultGraphicRow(type)
            expect(ALLOWED_PLACEMENTS[type]).toContain(row.placement)
        }
    })

    test('is disabled by default', () => {
        expect(defaultGraphicRow('STARTLIST').enabled).toBe(false)
    })

    test('only sets displaySeconds/listLength for the types that use them', () => {
        expect(defaultGraphicRow('STARTLIST').settings.displaySeconds).toBe(15)
        expect(defaultGraphicRow('LAPS').settings.displaySeconds).toBe(8)
        expect(defaultGraphicRow('RESULT').settings.displaySeconds).toBe(20)
        expect(defaultGraphicRow('CLOCK').settings.displaySeconds).toBeNull()
        expect(defaultGraphicRow('SCHEDULE').settings.listLength).toBe(8)
        expect(defaultGraphicRow('STARTLIST').settings.listLength).toBeNull()
    })
})

describe('usesDisplaySeconds / usesListLength / usesImageDocument', () => {
    test('flags exactly the types the settings apply to', () => {
        expect(STREAM_GRAPHIC_TYPES.filter(usesDisplaySeconds)).toEqual(['STARTLIST', 'LAPS', 'RESULT'])
        expect(STREAM_GRAPHIC_TYPES.filter(usesListLength)).toEqual(['SCHEDULE'])
        expect(STREAM_GRAPHIC_TYPES.filter(usesImageDocument)).toEqual(['COURSE_IMAGE'])
    })
})

describe('withAllGraphicTypes', () => {
    test('fills in all eight types in canonical order when given an empty list', () => {
        const result = withAllGraphicTypes([])
        expect(result.map(g => g.type)).toEqual(STREAM_GRAPHIC_TYPES)
    })

    test('preserves an already configured row untouched', () => {
        const configured: StreamSceneGraphicDto = {
            type: 'CLOCK',
            enabled: true,
            placement: 'TOP_LEFT',
            size: 'COMPACT',
            settings: {displaySeconds: null, listLength: null, imageDocument: null},
        }
        const result = withAllGraphicTypes([configured])
        expect(result.find(g => g.type === 'CLOCK')).toEqual(configured)
    })

    test('never drops a type and never duplicates one', () => {
        const result = withAllGraphicTypes([defaultGraphicRow('SCHEDULE'), defaultGraphicRow('RESULT')])
        expect(result).toHaveLength(8)
        expect(new Set(result.map(g => g.type)).size).toBe(8)
    })
})
