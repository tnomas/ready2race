import {describe, expect, it, vi} from 'vitest'
import {
    CHUNK_RELOAD_COOLDOWN_MS,
    CHUNK_RELOAD_STORAGE_KEY,
    ChunkReloadDeps,
    isChunkLoadError,
    loadChunk,
    mayReloadAfter,
    parseReloadStamp,
    tryChunkReload,
} from './chunkReload.ts'

const memoryStorage = (initial: Record<string, string> = {}) => {
    const values = new Map(Object.entries(initial))
    return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => void values.set(key, value),
        values,
    }
}

const deps = (overrides: Partial<ChunkReloadDeps> = {}): ChunkReloadDeps => ({
    storage: memoryStorage(),
    now: () => 1_000_000,
    probe: async () => true,
    reload: vi.fn(),
    ...overrides,
})

describe('isChunkLoadError', () => {
    it('erkennt die Meldungen von Chromium, Firefox und Safari', () => {
        expect(
            isChunkLoadError(
                new TypeError(
                    'Failed to fetch dynamically imported module: https://x/assets/Page-abc.js',
                ),
            ),
        ).toBe(true)
        expect(
            isChunkLoadError(new TypeError('error loading dynamically imported module: x')),
        ).toBe(true)
        expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true)
        expect(isChunkLoadError(new Error('Unable to preload CSS for /assets/a.css'))).toBe(true)
    })

    it('hält gewöhnliche Fehler und Nicht-Fehler nicht für Ladefehler', () => {
        expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false)
        expect(isChunkLoadError('Failed to fetch dynamically imported module')).toBe(false)
        expect(isChunkLoadError(undefined)).toBe(false)
    })
})

describe('mayReloadAfter', () => {
    it('erlaubt das erste Neuladen', () => {
        expect(mayReloadAfter(null, 5)).toBe(true)
    })

    it('sperrt innerhalb der Frist und gibt danach wieder frei', () => {
        expect(mayReloadAfter(1000, 1000 + CHUNK_RELOAD_COOLDOWN_MS - 1)).toBe(false)
        expect(mayReloadAfter(1000, 1000 + CHUNK_RELOAD_COOLDOWN_MS)).toBe(true)
    })

    it('behandelt einen Zeitstempel aus der Zukunft als abgelaufen', () => {
        expect(mayReloadAfter(10_000, 5_000)).toBe(true)
    })
})

describe('parseReloadStamp', () => {
    it('liest Zahlen und verwirft Unsinn', () => {
        expect(parseReloadStamp(null)).toBeNull()
        expect(parseReloadStamp('123')).toBe(123)
        expect(parseReloadStamp('abc')).toBeNull()
    })
})

describe('tryChunkReload', () => {
    it('lädt neu und merkt sich den Zeitpunkt', async () => {
        const storage = memoryStorage()
        const d = deps({storage})
        expect(await tryChunkReload(d)).toBe(true)
        expect(d.reload).toHaveBeenCalledOnce()
        expect(storage.values.get(CHUNK_RELOAD_STORAGE_KEY)).toBe('1000000')
    })

    it('lädt innerhalb der Sperrfrist nicht noch einmal (keine Schleife)', async () => {
        const storage = memoryStorage({[CHUNK_RELOAD_STORAGE_KEY]: String(1_000_000 - 1000)})
        const d = deps({storage})
        expect(await tryChunkReload(d)).toBe(false)
        expect(d.reload).not.toHaveBeenCalled()
    })

    it('lädt nicht neu, wenn der Server nicht antwortet', async () => {
        const d = deps({probe: async () => false})
        expect(await tryChunkReload(d)).toBe(false)
        expect(d.reload).not.toHaveBeenCalled()
    })

    it('lädt ohne nutzbaren Speicher nie automatisch neu', async () => {
        const d = deps({storage: null})
        expect(await tryChunkReload(d)).toBe(false)
        const throwing = deps({
            storage: {
                getItem: () => null,
                setItem: () => {
                    throw new Error('QuotaExceededError')
                },
            },
        })
        expect(await tryChunkReload(throwing)).toBe(false)
        expect(throwing.reload).not.toHaveBeenCalled()
    })
})

describe('loadChunk', () => {
    it('reicht ein erfolgreiches Modul durch', async () => {
        expect(await loadChunk(async () => ({default: 42}), deps())).toEqual({default: 42})
    })

    it('reicht andere Fehler unverändert weiter', async () => {
        const d = deps()
        await expect(loadChunk(() => Promise.reject(new Error('kaputt')), d)).rejects.toThrow(
            'kaputt',
        )
        expect(d.reload).not.toHaveBeenCalled()
    })

    it('lädt bei einem Ladefehler neu und lässt das Versprechen offen', async () => {
        const d = deps()
        let settled = false
        void loadChunk(
            () => Promise.reject(new TypeError('Failed to fetch dynamically imported module: x')),
            d,
        ).finally(() => {
            settled = true
        })
        await vi.waitFor(() => expect(d.reload).toHaveBeenCalledOnce())
        await Promise.resolve()
        expect(settled).toBe(false)
    })

    it('reicht den Ladefehler weiter, wenn die Sperrfrist ein Neuladen verbietet', async () => {
        const storage = memoryStorage({[CHUNK_RELOAD_STORAGE_KEY]: String(1_000_000)})
        await expect(
            loadChunk(
                () => Promise.reject(new TypeError('Importing a module script failed.')),
                deps({storage}),
            ),
        ).rejects.toThrow('Importing a module script failed.')
    })
})
