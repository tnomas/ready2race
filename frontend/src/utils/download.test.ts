// @vitest-environment jsdom
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {downloadBlob, downloadResponse, REVOKE_DELAY_MS, runDownload} from './download.ts'

describe('download', () => {
    let clicked: {href: string; download: string}[]
    let created: Blob[]
    let revoked: string[]

    beforeEach(() => {
        vi.useFakeTimers()
        clicked = []
        created = []
        revoked = []
        URL.createObjectURL = (blob: Blob | MediaSource) => {
            created.push(blob as Blob)
            return `blob:test/${created.length}`
        }
        URL.revokeObjectURL = (url: string) => {
            revoked.push(url)
        }
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
            this: HTMLAnchorElement,
        ) {
            clicked.push({href: this.href, download: this.download})
            // Der Anker hängt während des Klicks im Dokument.
            expect(document.body.contains(this)).toBe(true)
        })
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    it('klickt einen Anker mit Dateinamen und räumt ihn danach weg', () => {
        downloadBlob(new Blob(['x']), 'datei.pdf')

        expect(clicked).toEqual([{href: 'blob:test/1', download: 'datei.pdf'}])
        expect(document.querySelectorAll('a').length).toBe(0)
    })

    it('gibt die Blob-URL erst nach der Frist frei', () => {
        downloadBlob(new Blob(['x']), 'datei.pdf')
        expect(revoked).toEqual([])

        vi.advanceTimersByTime(REVOKE_DELAY_MS)
        expect(revoked).toEqual(['blob:test/1'])
    })

    it('nimmt den Namen aus Content-Disposition', () => {
        const response = new Response(null, {
            headers: {'Content-Disposition': 'attachment; filename="rechnung-7.pdf"'},
        })

        expect(downloadResponse(new Blob(['x']), response, 'invoice.pdf')).toBe(true)
        expect(clicked[0].download).toBe('rechnung-7.pdf')
    })

    it('fällt ohne Kopfzeile oder Antwort auf den Ersatznamen zurück', () => {
        downloadResponse(new Blob(['x']), new Response(null), 'invoice.pdf')
        downloadResponse(new Blob(['x']), undefined, 'andere.pdf')

        expect(clicked.map(c => c.download)).toEqual(['invoice.pdf', 'andere.pdf'])
    })

    it('tut ohne Daten nichts', () => {
        expect(downloadResponse(undefined, new Response(null), 'x.pdf')).toBe(false)
        expect(clicked).toEqual([])
        expect(created).toEqual([])
    })

    it('gibt die URL auch frei, wenn der Klick wirft', () => {
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
            throw new Error('boom')
        })

        expect(() => downloadBlob(new Blob(['x']), 'a.pdf')).toThrow('boom')
        vi.advanceTimersByTime(REVOKE_DELAY_MS)
        expect(revoked).toEqual(['blob:test/1'])
        expect(document.querySelectorAll('a').length).toBe(0)
    })

    describe('runDownload', () => {
        it('lädt nach dem Zurücksetzen der Sperre herunter und nutzt den Dateinamen der Antwort', async () => {
            const busy: boolean[] = []
            const response = new Response(null, {
                headers: {'Content-Disposition': 'attachment; filename="a.pdf"'},
            })

            const outcome = await runDownload(
                b => busy.push(b),
                () => Promise.resolve({data: new Blob(['x']), response}),
                'fallback.pdf',
            )

            expect(outcome).toEqual({downloaded: true})
            expect(busy).toEqual([true, false])
            expect(clicked.map(c => c.download)).toEqual(['a.pdf'])
        })

        it('meldet API-Fehler ohne Download', async () => {
            const outcome = await runDownload(
                undefined,
                () => Promise.resolve({error: {code: 'X'}}),
                'f.pdf',
            )

            expect(outcome).toEqual({downloaded: false, error: {code: 'X'}})
            expect(clicked).toEqual([])
        })

        it('übersetzt Netzfehler und gibt die Sperre frei', async () => {
            const busy: boolean[] = []

            const outcome = await runDownload(
                b => busy.push(b),
                () => Promise.reject(new TypeError('Failed to fetch')),
                'f.pdf',
            )

            expect(outcome.downloaded).toBe(false)
            expect(outcome.error).toMatchObject({kind: 'network'})
            expect(busy).toEqual([true, false])
            expect(clicked).toEqual([])
        })
    })
})
