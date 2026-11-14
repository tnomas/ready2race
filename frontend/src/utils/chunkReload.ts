/**
 * Neuladen nach einem fehlgeschlagenen Nachladen von Code-Stücken.
 *
 * Seit dem Code-Splitting lädt die App Seiten und Sprachen als einzelne Stücke (`import()`) nach.
 * Nach einem Deployment liegen auf dem Server nur noch die Stücke des neuen Builds; eine Seite, die
 * noch den alten Einstieg im Speicher hat, fragt aber nach den alten Dateinamen und bekommt sie
 * nicht. Gerade unbeaufsichtigte Bildschirme (Boards, OBS-/Wirecast-Browserquellen) hingen dann
 * dauerhaft fest. Ein Neuladen holt den neuen Einstieg und behebt das.
 *
 * Damit daraus keine Schleife wird, lädt die Seite höchstens einmal je Sperrfrist neu (Zeitstempel
 * in `sessionStorage`), und nur, wenn der Server überhaupt antwortet: Ohne Netz zeigte ein
 * Neuladen in einer Browserquelle sonst die Fehlerseite des Browsers mitten im Livebild.
 */

/** Meldungen, mit denen die Browser einen gescheiterten dynamischen Import melden. */
const CHUNK_ERROR_PATTERNS = [
    // Chromium (auch OBS und Wirecast)
    /Failed to fetch dynamically imported module/i,
    // Firefox
    /error loading dynamically imported module/i,
    // Safari
    /Importing a module script failed/i,
    // Vites Vorab-Laden der Stylesheets eines Stücks
    /Unable to preload CSS/i,
]

export const isChunkLoadError = (error: unknown): boolean =>
    error instanceof Error && CHUNK_ERROR_PATTERNS.some(pattern => pattern.test(error.message))

export const CHUNK_RELOAD_STORAGE_KEY = 'r2r.chunkReloadAt'

/** Höchstens ein automatisches Neuladen je Minute. */
export const CHUNK_RELOAD_COOLDOWN_MS = 60_000

/**
 * Darf jetzt neu geladen werden? Ein Zeitstempel aus der Zukunft (Uhr zurückgestellt) zählt als
 * abgelaufen, sonst sperrte er bis zum Erreichen dieser Zeit jeden weiteren Versuch.
 */
export const mayReloadAfter = (
    lastReloadAt: number | null,
    now: number,
    cooldownMs: number = CHUNK_RELOAD_COOLDOWN_MS,
): boolean => lastReloadAt === null || now < lastReloadAt || now - lastReloadAt >= cooldownMs

export const parseReloadStamp = (raw: string | null): number | null => {
    if (raw === null) return null
    const value = Number(raw)
    return Number.isFinite(value) ? value : null
}

export type ChunkReloadDeps = {
    storage: Pick<Storage, 'getItem' | 'setItem'> | null
    now: () => number
    /** Antwortet der Server? Ohne Antwort bleibt die Seite stehen, wie sie ist. */
    probe: () => Promise<boolean>
    reload: () => void
}

const browserStorage = (): Pick<Storage, 'getItem' | 'setItem'> | null => {
    try {
        return window.sessionStorage
    } catch {
        return null
    }
}

const browserDeps = (): ChunkReloadDeps => ({
    storage: browserStorage(),
    now: () => Date.now(),
    probe: async () => {
        try {
            const response = await fetch(window.location.href, {
                method: 'HEAD',
                cache: 'no-store',
            })
            return response.ok
        } catch {
            return false
        }
    },
    reload: () => window.location.reload(),
})

/**
 * Lädt die Seite neu, wenn Sperrfrist und Server es erlauben. Liefert `true`, wenn das Neuladen
 * angestoßen wurde. Ohne nutzbaren Speicher wird nie automatisch neu geladen - die Sperre gegen
 * Schleifen ließe sich sonst nicht halten.
 */
export const tryChunkReload = async (deps: ChunkReloadDeps = browserDeps()): Promise<boolean> => {
    if (deps.storage === null) return false
    let lastReloadAt: number | null
    try {
        lastReloadAt = parseReloadStamp(deps.storage.getItem(CHUNK_RELOAD_STORAGE_KEY))
    } catch {
        return false
    }
    if (!mayReloadAfter(lastReloadAt, deps.now())) return false
    if (!(await deps.probe())) return false
    try {
        deps.storage.setItem(CHUNK_RELOAD_STORAGE_KEY, String(deps.now()))
    } catch {
        return false
    }
    deps.reload()
    return true
}

/**
 * Hüllt einen dynamischen Import ein: Scheitert er an einem fehlenden Stück und darf neu geladen
 * werden, lädt die Seite neu und das Versprechen bleibt offen (die Seite ist ohnehin gleich weg).
 * Sonst geht der Fehler unverändert weiter an die Fehlerseite der Route.
 */
export const loadChunk = async <T>(
    importer: () => Promise<T>,
    deps?: ChunkReloadDeps,
): Promise<T> => {
    try {
        return await importer()
    } catch (error) {
        if (isChunkLoadError(error) && (await tryChunkReload(deps))) {
            return new Promise<T>(() => {})
        }
        throw error
    }
}
