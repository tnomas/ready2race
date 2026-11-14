import {describe, expect, test} from 'vitest'
import {PHOTO_MAX_BYTES, PHOTOS_PER_UPLOAD, preparePhotos} from './damagePhotos.ts'

const file = (name: string, size: number, type = 'image/jpeg') =>
    new File([new Uint8Array(size)], name, {type})

describe('preparePhotos', () => {
    test('verkleinert nacheinander, nie zwei Fotos gleichzeitig', async () => {
        let running = 0
        let maxRunning = 0
        const resize = async (f: File) => {
            running++
            maxRunning = Math.max(maxRunning, running)
            await new Promise(resolve => setTimeout(resolve, 1))
            running--
            return f
        }
        const progress: string[] = []
        const result = await preparePhotos(
            [file('a.jpg', 10), file('b.jpg', 10), file('c.jpg', 10)],
            resize,
            (done, total) => progress.push(`${done}/${total}`),
        )
        expect(maxRunning).toBe(1)
        expect(result.accepted.map(f => f.name)).toEqual(['a.jpg', 'b.jpg', 'c.jpg'])
        expect(progress).toEqual(['1/3', '2/3', '3/3'])
    })

    test('sortiert Nicht-Bilder, zu große und überzählige Fotos mit Namen aus', async () => {
        const many = Array.from({length: PHOTOS_PER_UPLOAD + 1}, (_, i) => file(`p${i}.jpg`, 1))
        const result = await preparePhotos(
            [
                file('liste.pdf', 1, 'application/pdf'),
                file('riesig.jpg', PHOTO_MAX_BYTES + 1),
                ...many,
            ],
            async f => f,
        )
        expect(result.accepted).toHaveLength(PHOTOS_PER_UPLOAD)
        expect(result.rejected).toEqual([
            {name: 'liste.pdf', reason: 'notImage'},
            {name: 'riesig.jpg', reason: 'tooLarge'},
            {name: `p${PHOTOS_PER_UPLOAD}.jpg`, reason: 'tooMany'},
        ])
    })

    test('mehr als 50 MB zusammen: das überzählige Foto bleibt draußen', async () => {
        const nine = 9 * 1024 * 1024
        const files = Array.from({length: 6}, (_, i) => file(`g${i}.jpg`, nine))
        const result = await preparePhotos(files, async f => f)
        expect(result.accepted).toHaveLength(5)
        expect(result.rejected).toEqual([{name: 'g5.jpg', reason: 'totalTooLarge'}])
    })

    test('HEIC ohne Typangabe des Browsers gilt als Bild', async () => {
        const result = await preparePhotos([file('IMG_1.HEIC', 5, '')], async f => f)
        expect(result.accepted).toHaveLength(1)
    })
})
