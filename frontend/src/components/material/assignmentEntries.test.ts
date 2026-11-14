import {describe, expect, test} from 'vitest'
import {MaterialAssignmentDto} from '@api/types.gen.ts'
import {assignmentEntriesAfter} from './assignmentEntries.ts'

const a = (id: string, materialItem: string, competitionMatch?: string): MaterialAssignmentDto => ({
    id,
    materialItem,
    ...(competitionMatch ? {competitionMatch} : {}),
})

const current = [a('g1', 'boot7'), a('x1', 'boot8', 'finale')]

describe('assignmentEntriesAfter', () => {
    test('setBase ersetzt die Grundzuteilung und behält Ausnahmen', () => {
        expect(assignmentEntriesAfter(current, {kind: 'setBase', itemIds: ['boot3']})).toEqual([
            {materialItem: 'boot3'},
            {materialItem: 'boot8', competitionMatch: 'finale'},
        ])
        expect(assignmentEntriesAfter(current, {kind: 'setBase', itemIds: []})).toEqual([
            {materialItem: 'boot8', competitionMatch: 'finale'},
        ])
    })

    test('addBase hängt an und schickt nichts doppelt', () => {
        expect(
            assignmentEntriesAfter(current, {kind: 'addBase', itemIds: ['boot3', 'boot7']}),
        ).toEqual([
            {materialItem: 'boot7'},
            {materialItem: 'boot8', competitionMatch: 'finale'},
            {materialItem: 'boot3'},
        ])
    })

    test('remove nimmt genau eine Zuteilung heraus', () => {
        expect(assignmentEntriesAfter(current, {kind: 'remove', assignmentId: 'x1'})).toEqual([
            {materialItem: 'boot7'},
        ])
    })

    test('addException ergänzt eine Ausnahme je Lauf', () => {
        expect(
            assignmentEntriesAfter(current, {
                kind: 'addException',
                matchId: 'vorlauf',
                itemId: 'boot6',
            }),
        ).toEqual([
            {materialItem: 'boot7'},
            {materialItem: 'boot8', competitionMatch: 'finale'},
            {materialItem: 'boot6', competitionMatch: 'vorlauf'},
        ])
    })

    test('replaceInMatch ohne Ausnahme: Grundzuteilung wird im Lauf mit Ersatz zur Ausnahme', () => {
        const two = [a('g1', 'boot7'), a('g2', 'boot2')]
        expect(
            assignmentEntriesAfter(two, {
                kind: 'replaceInMatch',
                matchId: 'finale',
                oldItemId: 'boot7',
                newItemId: 'boot8',
            }),
        ).toEqual([
            {materialItem: 'boot7'},
            {materialItem: 'boot2'},
            {materialItem: 'boot8', competitionMatch: 'finale'},
            {materialItem: 'boot2', competitionMatch: 'finale'},
        ])
    })

    test('replaceInMatch mit Ausnahme im Lauf: tauscht dort das ausgefallene Stück', () => {
        expect(
            assignmentEntriesAfter(current, {
                kind: 'replaceInMatch',
                matchId: 'finale',
                oldItemId: 'boot8',
                newItemId: 'boot6',
            }),
        ).toEqual([{materialItem: 'boot7'}, {materialItem: 'boot6', competitionMatch: 'finale'}])
    })

    test('replaceInMatch, wenn das alte Stück im Lauf gar nicht steht: Ersatz kommt dazu', () => {
        expect(
            assignmentEntriesAfter(current, {
                kind: 'replaceInMatch',
                matchId: 'finale',
                oldItemId: 'boot5',
                newItemId: 'boot6',
            }),
        ).toEqual([
            {materialItem: 'boot7'},
            {materialItem: 'boot8', competitionMatch: 'finale'},
            {materialItem: 'boot6', competitionMatch: 'finale'},
        ])
    })
})
